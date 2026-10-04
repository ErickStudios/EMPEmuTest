/**
          **  PROCYON5800  ***
         HANDHELD GAME CONSOLE

           ** MEMMORY MAPP **
    MMU MAX ADDRESS = 4K / FFF, 4096B

    080-0FF = STD TEMP (AUXILIAR REGS)
    100-33F = RESERVED
    340-3FF = TILE VRAM (16X12)
    400-6FF = DEVICES
    700-EFF = TEMP MEM (USER DATA + CODE MEM)
    F00-FFB = STD ROM (START FIRMWARE CODE)
    FFC-FFF = ROM JMP (JMP TO START FIRMWARE)
    FFF     = MEM EOF (END OF FILE/MEMORY)

    MIRRORED THE SAME 4K IN ALL RAM
            EXAMPLE 1234 = 234

        *** MMIO PORTS FROM DEVICE MAP  ***

    401     = (WORD) SET SECTOR OF READING
    403     = (WORD) READ TWO BYTES FROM CARD0
    405     = (BYTE) STEP THE READER
    500     = (BYTE) RET FROM STACK  (THE VALUE WRITED DONT CARE)
    501     = (BYTE) LINK AT NEXT JMP (THE VALUE WRITED DONT CARE)
    600     = (PTR) GPU MAKE ACTION

        ***     GPU ACTIONS LISTING     ***
    
    00      = REPLACE P2 TILES PRESETS FROM P1

        ***     BUTTONS CONVENTIONS     ***

    BRK     = COLD RESET / RELOAD OR LOAD NEW GAME
              IF THE CARD IS SWITCHED (UNINTERCEPTABLE BY SOFTWARE)
    A (01)  = FUNCTION BUTTON 1
    B (02)  = FUNCTION BUTTON 2
    X (03)  = FUNCTION BUTTON 3
    Y (04)  = EXTRA BUTTON 0
    V (0A)  = VERIFY (IN A YN CHOSING = YES) / ACEPT
    N (0B)  = CANCEL
 */

import * as emp from "https://cdn.jsdelivr.net/gh/ErickStudios/EMP-Arch@72578d959d6312e3fd5f69bfc5e3fdb0509125c5/Toolchain/libemp.js?v=200"

async function loadFile(fnam) {
  const url = new URL(fnam, import.meta.url)
  const txt = await fetch(url).then(r => r.text())
  return txt;
}

let cpu = new emp.cpuGen2();

let isDraggin = false;
let showingCursor = false;
let pentouchx = 0;
let pentouchy = 0;
let startpx = 0;
let startpy = 0;
let countQuedRender = 1000;
let maxRenderRegresiveCountValue = countQuedRender;
let showerMouseHs = true;
let kybuf = [];
let pc = 0xFFC;
let sp = 0xF00;
let lif = false;
let rtins = 0;
//let card = emp.g2asm.parseAsm(await loadFile('./play0.asm')).result;
let card = null;
let ram0 = new Array(0x800).fill(0);
let tmpm0 = new Array(0x80).fill(0);
let vram = new Array(16*12).fill(0).map(v => Math.floor(Math.random() * 255))
/*let spritePalette = Array.from({ length: 256 }, () => {
  let bra = new Array(6).fill(0).map(v => Math.floor(Math.random() * 0xFFFFFF));
  
  let nara = 0n;
  bra.forEach(v => {
    nara = nara << 24n
    nara = nara | BigInt(v);
  })

  return nara;
});*/
let spritePalette = Array.from({length: 256}).fill(0x004004040040400400004004040040400400n)

class AudioChip {
    constructor() {
        /** @type {AudioContext} */
        this.channels = [];
        this.currentChannel = 0;
        this.inited = false;

        this.ids = {
            0: 'square',
            1: 'triangle',
            2: 'sawtooth'
        }
    }
    mk() {
        if(!this.ctx) this.init();
        if(this.ctx.state==='suspended') this.ctx.resume();
    }
    init() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        for(let i=0;i<3;i++){
            let osc = this.ctx.createOscillator();
            let gain = this.ctx.createGain();
            gain.gain.value = 0;
            osc.type = 'square';
            osc.start();
            osc.connect(gain).connect(this.ctx.destination);
            this.channels.push({osc, gain, playing: false});
        }
    }
    // Switching Channel
    switchWorkChannel(id) {
        this.mk();
        this.currentChannel = id;
    }
    // Switching Channels Types
    switchWorkChType(tyid) {
        this.mk();
        this.channels[this.currentChannel].osc.type = this.ids[tyid];
    }
    // Switch Channel Freq
    switchChannelFreq(frq) {
        this.mk();
        let freq = 440 * Math.pow(2, (frq - 69)/12);
        let ch = this.channels[this.currentChannel];
        if (frq == 0) {
            ch.gain.gain.setValueAtTime(0, this.ctx.currentTime)
        }
        else {
            ch.osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
            ch.gain.gain.setValueAtTime(0.18, this.ctx.currentTime);
        }
    }
}

let chipau = new AudioChip()

// 32-90
let knowPresets = [
    8920298079412249256614287309059344602392166n, 
    15615766992419042319382111975940763866668290n, 
    7469232289288274397751043687098606264876003n, 
    17893010735169183420827786141513975415189187n, 
    13990814860393207691334345053723199205418078n, 
    21242170041124002114977823202992213893977395n, 
    17178876671240306773596173445415313810296328n, 
    10524697141599196668456554404557390679647914n, 
    16824158440523766177791032181077207702711610n, 
    14884731601484014940869563384685621367499605n, 
    6289433244729929518100689571123423499429662n,
    2616393690038795753299822611830834817664566n,
    18782368333028513589898824743837284871725966n, 
    22269809851305591585124856150005965874388688n, 
    8868208170514763938318130693206535386327034n, 
    14825585677948142892819273184564627488078377n, 
    8966576522862015437210442209684058660073062n, 
    8923020341106026955970107187713994782043750n, 
    8966576522862012961330216605394625985703654n, 
    8966576522862012961330225828766115231624934n, 
    8920468220768110362824173625437230123607782n, 
    9663644951489416839227103151424244206726886n, 
    9663644951489416839227250725385629976162022n, 
    9663655543775639435281589970419889501791846n, 
    8966576522862013125139812196705762035035750n, 
    8966576522862013125744127532551690852953702n, 
    10038807053747859380247721581572670436284771n, 
    7311786643932067622056768936555866629703582n, 
    499665579558274991763979587238791646573344n, 
    6601079450228775110035089572298844599224067n, 
    3362223214217757565677933081195402317636439n, 
    21474225251967866134814552571412127682796151n, 
    12917742128085691624446403997749824150221108n, 
    8966576522862015437210452009516847818761958n, 
    9663474810316097574797344873293887717699174n, 
    8966746664035334701035885115939687164735206n, 
    9663474810316097410383433405704319957659238n, 
    9663644951489416839227250689356830809714406n, 
    9663644951489416839227250689356830809679462n, 
    8966746664035334711311754618692834316185190n, 
    8920298120960767806179433062906127342003942n, 
    8920298082008397685881710346697179377624678n, 
    20814017511812499484827816223769329648199270n, 
    8963854224974911789852104808089797460944494n, 
    8963854224974277963947527207120980071083758n, 
    20070682018664714676082935823155524310296174n, 
    20070682018654573461609704007487271737910894n,
    8966576522862015437210442209684058660073062n, 
    9663474810316097410383443169508309949376102n, 
    9663475433391757572766141540624902623522414n, 
    9663474810316097410383443169508344309114598n, 
    8966746664035332379898164494388633522335334n, 
    9663655543937264895877632866219922574175846n, 
    9617207042229308678611001957317499804905190n, 
    9617207042229308678611001957309255480929894n, 
    20070681977116198438588577491978105246901990n, 
    8920298744036390839425543947233298880030438n, 
    8920298744036390839425543947225018174727782n,
    0x6666666eeee66666e6666e6666e6666eeee6n
]

let vdclr = [
    '#000','#888',
    '#800','#740',
    '#880','#680',
    '#228','#508',

    '#444','#ddd',
    '#f44','#d80',
    '#cc0','#9f4',
    '#aae','#548'
]

function getListingColors(bt) {
    let abt = bt & 0xFFFFFF;
    let b0_1 = (abt >> 16) & 0xFF;
    let b2_3 = (abt >> 8) & 0xFF;
    let b4_5 = abt & 0xFF;

    function byteGetPairCol(byt) {
        let byte = byt & 0xFF;
        return [vdclr[(byte >> 4) & 0xF], vdclr[byte & 0xF]]
    }

    return [
        ...byteGetPairCol(b0_1),
        ...byteGetPairCol(b2_3),
        ...byteGetPairCol(b4_5)
    ]
}

function getListingRowsForSprite(sprite0) {
    let sprite = sprite0 & 0xFFFFFF_FFFFFF_FFFFFF_FFFFFF_FFFFFF_FFFFFFn;
    let rows = [];

    for (let y = 0; y < 6; y++) {        
        let roa = getListingColors(Number(sprite & 0xFFFFFFn))
        rows.push(roa);
        sprite = sprite >> 24n;
    }

    return rows.reverse();
}

/** @type {CanvasRenderingContext2D} */
let videoctx = document.getElementById('videomem').getContext('2d');

function color4ToXd(clr) {
  if(!clr) return null;
  let r = (clr.rgb & 0b100) ? 1 : 0;
  let g = (clr.rgb & 0b010) ? 1 : 0;
  let b = (clr.rgb & 0b001) ? 1 : 0;

  let mult = clr.bright ? 2 : 1;
  r = Math.min(255, r * 127 * mult);
  g = Math.min(255, g * 127 * mult);
  b = Math.min(255, b * 127 * mult);

  if(clr.rgb === 0) { r=g=b=0; }

  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

function drawSprite(sprite0, x0, y0, putPixel) {
  let sprite = getListingRowsForSprite(sprite0);

  sprite.forEach((v, i) => {
    v.forEach((v2, i2) => {
        putPixel(x0 + i2, y0 + i, v2);
    })
  })
}

function putPixel(x, y, color) {
  videoctx.fillStyle = color;
  videoctx.fillRect(x,y,1,1);
}

function render() {
  let mba = 0;
  for (let a = 0; a < 12; a++) {
    for (let b = 0; b < 16; b++) {
      drawSprite(spritePalette[vram[mba]], b * 6, a * 6, putPixel)
      mba++;
    }
  }

  if (showingCursor && showerMouseHs) {
    videoctx.fillStyle = '#ffffff';
    
    if (isDraggin) {
        videoctx.fillRect(Math.ceil(Math.ceil(pentouchx) * 6),Math.ceil(Math.ceil(pentouchy) * 6),6,6);
    }
    else {
        if (new Date().getMilliseconds() < 500) videoctx.fillStyle = '#ffffff77'
        videoctx.fillRect(Math.ceil(Math.ceil(pentouchx) * 6),Math.ceil(((pentouchy) * 6) + 4),4,2);
    }
  }
}

render()

function gpuMake(adr) {
    let action = cpu.rex(adr);

    // Change Sprite Preload Id
    if (action == 0) {
        let from = cpu.rex(adr + 1);
        let count = cpu.rex(adr + 2);

        let ptr = adr + 3;

        while (count != 0) {
            function getRowModi(adra) {
                return ( 
                    (cpu.rex(adra) << 16) |
                    (cpu.rex(adra+1) << 8) |
                    cpu.rex(adra+2)
                );
            }

            let newSpriteLoad = (
                (BigInt(getRowModi(ptr)) << (24n * 5n)) |
                (BigInt(getRowModi(ptr+3)) << (24n * 4n)) |
                (BigInt(getRowModi(ptr+6)) << (24n * 3n)) |
                (BigInt(getRowModi(ptr+9)) << (24n * 2n)) |
                (BigInt(getRowModi(ptr+12)) << 24n) |
                (BigInt(getRowModi(ptr+15)))
            );

            ptr += 18;

            spritePalette[from] = newSpriteLoad;

            from++;
            count--;
        }

    }
}

// Port Of Cpu of external chip SBC
let prt_dev = {
    // Base Of The MMIO address
    baseAddr: 0x400,
    limit: 0x2ff,

    cardIndex: 0,
    cardSector: 0,
    cardBytesReaded: 0,
    efectiveVideoModAdr: 0,
    chipausfx: 0,

    // Port Data Read
    in(port) {
        if (port == 3 || port == 4) {
            this.cardBytesReaded ++;
            return card[this.cardIndex + (port - 3)];
        }

        if (port == 0x00) {
            return Array.isArray(card) ? 0x00 : 0xFF;
        }

        else if (port == 0x30) {
            return Number(countQuedRender > (maxRenderRegresiveCountValue / 1.2));
        }

        else if (port == 0x40) {
            return kybuf.shift() ?? 0;
        }

        if(port == 0x41) return showingCursor ? Math.ceil(pentouchx) : 0
        if(port == 0x42) return showingCursor ? Math.ceil(pentouchy) : 0
        if(port == 0x43) return isDraggin && showingCursor ? 1 : 0;

        return 0;
    },

    // Port Data Write
    out(port, data) {
        if (port == 1) {
            this.cardSector = (this.cardSector & 0xFF) | (data << 8);
            this.cardIndex = this.cardSector * 512;
        }
        else if (port == 2) {
            this.cardSector = (this.cardSector & 0xFF00) | data;
            this.cardIndex = this.cardSector * 512;
        }
        else if (port == 5) {
            this.cardIndex += data;
        }
        else if (port == 0x43) {
            showingCursor = Boolean(data & 1);
        }
        else if (port == 0x101) {
            lif = true;
        }
        else if (port == 0x200) {
            this.efectiveVideoModAdr = data;
        }
        else if (port == 0x50) {
            chipau.switchWorkChannel(data);
        }
        else if (port == 0x51) {
            chipau.switchWorkChType(data)
        }
        else if (port == 0x52) {
            this.chipausfx = data;
        }
        else if (port == 0x53) {
            chipau.switchChannelFreq((this.chipausfx << 8) | data);
        }
        else if (port == 0x201) {
            gpuMake((this.efectiveVideoModAdr << 8) | data);
        }
        else if (port == 0x100) {
            pc = (cpu.rex(sp) << 8) | cpu.rex(sp+1) - ((rtins & 0x800000) == 0x800000 ? 3 : 2);
            sp+=2;
        }
    }
}

let dbglog = document.getElementById('debugLog')
let statar = document.getElementById('statar')

let rom = emp.g2asm.parseAsm(await loadFile('./bios.asm')).result

// Cpu On Read Memory
cpu.rex = function(adr2) {
    let adr = adr2 & 0xFFF;

    //TmpMem0
    if (adr >= 0x80 && adr < 0x100) return tmpm0[adr - 0x80];

    if (adr >= 0xF00 && adr < 0xFFF) return rom[adr - 0xF00];

    // Mapped Devices Controller
    if (adr >= prt_dev.baseAddr && adr <= (prt_dev.baseAddr + prt_dev.limit))
        return prt_dev.in(adr - prt_dev.baseAddr);

    if (adr >= 0x340 && adr < (0x340 + vram.length))
        return vram[adr - 0x340]; 

    // Ram0
    if (adr >= 0x700 && adr < (0x700 + ram0.length))
        return ram0[adr - 0x700];

    return 0;
};

// Cpu On Write Memory
cpu.wex = function(adr2, val) {
    let adr = adr2 & 0xFFF;

    // TmpMem0
    if (adr >= 0x80 && adr < 0x100) tmpm0[adr - 0x80] = val;

    // Mapped Devices Controller
    if (adr >= prt_dev.baseAddr && adr <= (prt_dev.baseAddr + prt_dev.limit))
        prt_dev.out(adr - prt_dev.baseAddr, val);

    if (adr >= 0x340 && adr < (0x340 + vram.length)) {
        vram[adr - 0x340] = val; 
    }

    // Ram0
    if (adr >= 0x700 && adr < (0x700 + ram0.length))
        ram0[adr - 0x700] = val;
}

// Cpu On Jump
cpu.jf = function(adr) {
    if (lif) {
        lif = false;
        sp -= 2;
        pc = pc + ((rtins & 0x800000) == 0x800000 ? 3 : 2);
        cpu.wex(sp, (pc >> 8) & 0xFF);
        cpu.wex(sp+1, (pc & 0xFF));
    }

    // Calculate PC
    pc = adr - ((rtins & 0x800000) == 0x800000 ? 3 : 2);
}

console.log(card)

// Cpu Stepper
function step() {
    // Set Information Of Instructions
    let ins = [cpu.rex(pc), cpu.rex(pc+1), cpu.rex(pc+2)];
    rtins = ((ins[0] << 16) | (ins[1] << 8) | ins[2])

    statar.textContent = `Card0 Controller

Index           : ${prt_dev.cardIndex}
Sector          : ${prt_dev.cardSector}
Bytes Readed    : ${prt_dev.cardBytesReaded}
Sectors Readed  : ${Math.floor(prt_dev.cardBytesReaded / 512)}

`

    // Instruction Disasembler
    if (window.halted) {
        // Calculate Instruccion Size
        let rta = (rtins & 0x800000) == 0x800000 ? ins.slice(0, 3) : ins.slice(0, 2);

        // Show Instruction info
        dbglog.textContent += pc.toString(16).padStart(4, '0').toUpperCase() + ' ' + rta.map(v => v.toString(16).padStart(2,'0')).join('').toUpperCase().padEnd(8, ' ') +  emp.g2asm.LineDisasm(ins)+ "\n";
    
        document.getElementById('regDbg').textContent = `A=${cpu.getRegister(0).toString(16).padStart(4, '0')} X=${cpu.getRegister(1).toString(16).padStart(4, '0')} Y=${cpu.getRegister(2).toString(16).padStart(4, '0')} Z=${cpu.getRegister(3).toString(16).padStart(4, '0')} F=${cpu.flags.join('')}`
    }
    let kat = cpu.exi(rtins);
    pc = pc + kat

    dbglog.scrollTop = dbglog.scrollHeight;
}

// Cpu Initializer
(function init() {
    cpu.rst();
    window.halted = true;
    window.step = step;
})()

step();

document.getElementById("console").focus();

let keysmap = {
    'A': 1,
    'B': 2,
    'X': 3,
    'Y': 4,
    'W': 5,
    'Z': 6,
    'L': 7,
    'J': 8,
    'V': 10,
    'N': 12,
    'ENTER': 10,
    'O': () => window.cpuReset(),
}
   
function geKey(ev) {
    let k = ev.key.toUpperCase();
    if (k == 'K') {
        videoctx.canvas.requestPointerLock();
    }

    else if (k == 'E') {
        card = null;
    }

    else if (k == 'M') {
        showerMouseHs = !showerMouseHs;
    }

    else if (k == 'I') {
        document.getElementById('CardSdSelect').click()
    }

    if(k in keysmap){
        ev.preventDefault();
        if(typeof keysmap[k] == 'function') keysmap[k]();
        else kybuf.push(keysmap[k]);
    }
}

videoctx.canvas.addEventListener('pointerlockchange', () => {
  if(document.pointerLockElement === videoctx.canvas){
    isDraggin = true;
  } else {
    isDraggin = false;
  }
});

//document.getElementById("console").addEventListener('keyup', geKey);
document.getElementById("console").addEventListener('keydown', geKey);
//document.getElementById("console").addEventListener('keypress', geKey);

/*videoctx.canvas.addEventListener('keydown', (ev) => {
    if (ev.key.length == 1) {
        kybuf.push(ev.key.toUpperCase().charCodeAt(0))
    } else if (ev.key == 'Enter') {
        chipau.switchWorkChannel(0);
        chipau.switchWorkChType(0);
        chipau.switchChannelFreq(400);
        kybuf.push(10)
    }
})*/

/** @type {HTMLInputElement} */
const input = document.getElementById('CardSdSelect');
const label = document.getElementById('cardName');

input.addEventListener('change', async (e)=>{
 /** @type {File} */
  const file = e.target.files[0];

  if(!file) return;
  let isAsm = file.name.toLowerCase().endsWith('.asm') || file.name.toLowerCase().endsWith('.s')

  if (isAsm) {
    label.textContent = file.name.toUpperCase().split('.')[0];
    const buf = await file.text();
    card = emp.g2asm.parseAsm(buf).result;
    prt_dev.cardBytesReaded = 0;
    console.log(card.length)
  }
  else {
    label.textContent = file.name.slice(0,13).toUpperCase();
    const buf = await file.arrayBuffer();
    card = new Uint8Array(buf);
    prt_dev.cardBytesReaded = 0;
  }
});

let vramcp = []

window.cpuPau = function() {
    if (!window.halted) {
        videoctx.canvas.style.filter = 'brightness(0.4)'
    }
    else {
        videoctx.canvas.style.filter = 'brightness(1)'
    }

    window.halted = !window.halted;
}

window.cpuReset = function() {
    videoctx.canvas.style.filter = 'brightness(1)'

    spritePalette.fill(0x004004040040400400004004040040400400n);
    window.halted = true;
    for (let index = 32; index < 91; index++) {
        spritePalette[index] = knowPresets[index - 32];
    }

    ram0.fill(0);
    tmpm0.fill(0);
    vram.fill(0)

    pentouchx = 0;
    pentouchy = 0;
    showingCursor = false;
    let x = new TextEncoder().encode('NO CARD0');

    for (let index = 0; index < x.length; index++) {
        vram[16*5+4+index] = Number(x[index]);
    }

    cpu.rst();
    pc = 0xFFC;
    sp = 0xF00;
    window.halted = false;

    kybuf.splice(0, kybuf.length);
}

window.cpuReset()

let clientXa = 0;
let clientYa = 0;

videoctx.canvas.addEventListener('mousedown', (ev) => {
    isDraggin = true;

    startpx = Math.floor(pentouchx);
    startpy = Math.floor(pentouchy);
    clientXa = ev.clientX;
    clientYa = ev.clientY;
});

window.addEventListener('mouseup', () => {
    isDraggin = false;
    if (Math.floor(pentouchx) == startpx && Math.floor(pentouchy) == startpy) {
        console.log('click');
    }
});

window.addEventListener('touchstart', () => {
    isDraggin = true;
})

videoctx.canvas.addEventListener('mousemove', (ev) => {
    if (showingCursor) {
    if(document.pointerLockElement === videoctx.canvas){
        pentouchx += ev.movementX / 25;
        pentouchy += ev.movementY / 25;

        pentouchx = Math.max(0, Math.min(15, pentouchx));
        pentouchy = Math.max(0, Math.min(11, pentouchy));

    } else if(isDraggin) {
        let deltaX = ev.clientX - clientXa;
        let deltaY = ev.clientY - clientYa;
        pentouchx += deltaX / 25;
        pentouchy += deltaY / 25;

        pentouchx = Math.max(0, Math.min(15, pentouchx));
        pentouchy = Math.max(0, Math.min(11, pentouchy));

        clientXa = ev.clientX;
        clientYa = ev.clientY;
    }
    }
});

function goFullscreen(){
  let c = videoctx.canvas;
  if(c.requestFullscreen) c.requestFullscreen();
  else if(c.webkitRequestFullscreen) c.webkitRequestFullscreen();
}

function exitFullscreen(){
  if(document.exitFullscreen) document.exitFullscreen();
}

document.addEventListener('keydown', e => {
  if(e.key === 'f' || e.key === 'F'){
    if(!document.fullscreenElement) goFullscreen();
    else exitFullscreen();
  }
});

window.sendIonj = function(s) {
    kybuf.push(s)
}

window.palette = spritePalette

// Cpu Instruction Autoexecuted
setInterval(function () {
    if (!window.halted) {
        for (let index = 0; index < 1600; index++) {
            step();
            if (countQuedRender == 0) {
                countQuedRender = maxRenderRegresiveCountValue;
                render();
            } else countQuedRender--;
        }
    }
}, 50);