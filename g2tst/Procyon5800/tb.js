/**
 * PROCYON5800 HANDHELD GAME CONSOLE
 * CPU: EMP-200 (FSM CO PROCESSOR)
 * CLOCK: ~32kHz board stepper
 * 
 * MEMORY MAP - MMU 4K MIRROR (FFF=EOF, 1234h->234h)
 * 
 * **************************************************
 * MEM_CHIP REGIONS OF MEMORY PYSHICAL
 * **************************************************
 * 080-0FF = STD TEMP (128B aux regs, cleared on BRK)
 * 100-33F = RESERVED (for 8-pin NVRAM programmer)
 * 340-3FF = TILE VRAM 16x12 = 192 bytes (C0h)
 * 400-6FF = DEVICES MMIO (LOGICAL_CHIP OWNS THIS REGION)
 * 700-EFF = USER RAM 2K (code+data, cleared on BRK)
 * F00-FFB = STD ROM (NO CARD0 firmware)
 * FFC-FFF = RESET VEC (JMP F00h)
 * FFF     = MEM EOF PYSHIC SPACE END + LAST BYTE OF ROM
 * 
 * **************************************************
 * LOGICAL_CHIP ABSOLUTE ADDRESSE FROM THE START MMIO ZONE
 * **************************************************
 * 
 * 401 _W WORD - SET SECTOR CARD0
 * 403 R_ WORD - READ 2 BYTES CARD0 (big endian)
 * 405 _W BYTE - STEP READER
 * 430 R_ BYTE - GPU_SOON FLAG (WARN before REFRESH-REST, anti-tear)
 * 440 R_ BYTE - KBD queue pop/shift / push
 * 441 R_ BYTE - LIGHTPEN X
 * 442 R_ BYTE - LIGHTPEN Y
 * 443 _W BYTE - LIGHTPEN CTRL 0b0000000C (C=disable)
 * 450 _W BYTE - SND CW select
 * 451 _W BYTE - SND WAVE type
 * 452 _W WORD - SND FREQ
 * 500 _W BYTE - RET (pop PC, value dont care)
 * 501 _W BYTE - LINK (push PC for next JMP)
 * 600 _W BYTE - GPU ACTION FROM ADDRESS STRUCT IN MEMORY (#GPU-MAK)
 * 
 * BUTTONS:     BRK=cold reset (uninterceptable), 
 *              A=01h 
 *              B=02h 
 *              X=03h 
 *              Y=04h 
 *              V=0Ah 
 *              N=0Bh 
 *              L=07h
 *              W=05h
 *              Z=06h
 *              J=08h
 * 
 * GPU-MAK: &PTR[ACTION, P1, P2, ...]
 *          ACTION 1: replaces of#P2 tile presets from P1 each tile map is 4 bits per pixel, and is a 6x6 pixels (18 bytes)
 *          ACTION 2: replace of#P2 using color from #P1 for each set is the index of real color of motherboard
 * 
 * FONT PERSISTENCE:
 * NVRAM holds 256 tiles. MASK ROM hidden holds 0,65-90 (0 + A-Z + 0)
 * CLR-REST: NVRAM[0,65-90] = MASK_ROM[0,65-90] (restored)
 *           NVRAM[1-64,91-255] = persistent (survives reset, dies only on BATT loss)
 *           VRAM = fill 0 + write "NO CARD0" phrase using tiles 65-90
 * 
 * BRK ROUTINE (hw wired):
 *      CLR-REST + CLEAR 080-0FF + CLEAR 700-EFF + PC=FFCh + START STEPPER
 * 
 * STEPPER LOOP (board master, CPU slave):
 *      1. MEM_CHIP read 3 bytes @ PC -> 24b bus BE -> CPU
 *      2. save bit23 -> CPU ACTION -> if READ/WRITE -> MEM_CHIP
 *      3. PC+= (bit23?3:2) except on JMP -> PC=ADDR-(bit23?3:2)
 *      4. GPU_COUNTER-- ; if <=WARN -> set 430=1 ; if ==0 -> REFRESH-REST + reload counter
 * 
 * REFRESH-REST: LCD reads 16x12 VRAM, each byte = index to NVRAM tile bitmap
 */

import { AudioChip } from './audio.js'
import { knowPresets } from './gpuchip.js'
import { loadFile } from './helper.js'
import * as emp from "https://cdn.jsdelivr.net/gh/ErickStudios/EMP-Arch@55971303eb5030f82f4e7577b3d9108a67323397/Toolchain/libemp.js?v=200"

// HTML Parameters for emulator
const dbglog = document.getElementById('debugLog')
const input = document.getElementById('CardSdSelect');
const label = document.getElementById('cardName');
const board = document.getElementById("console");
const cardstyle = document.getElementById('CardSdSelectStyle');
const statar = document.getElementById('statar');
let videoctx = document.getElementById('videomem').getContext('2d');
let startpx = 0;
let startpy = 0;
let keysmap = {'A': 1,'B': 2,'X': 3,'Y': 4,'W': 5,'Z': 6,'L': 7,'J': 8,'V': 10,'N': 12,'ENTER': 10,'O': () => window.cpuReset(),}
let clientXa = 0;
let clientYa = 0;

// Instanciations of Hardware
let cpu = new emp.cpuGen2();
let chipau = new AudioChip()

// Hardware Parameters
let isDraggin = false;
let showingCursor = false;
let pentouchx = 0;
let pentouchy = 0;
let showerMouseHs = true;
let kybuf = [];
let turbo_mode = false;
let pc = 0xFFC;
let sp = 0xF00;
let lif = false;
let rtins = 0;
let card = null;
let ram0 = new Array(0x800).fill(0);
let tmpm0 = new Array(0x80).fill(0);
let countQuedRender = 1000;
let maxRenderRegresiveCountValue = countQuedRender;
let vram = new Array(16*12).fill(0).map(v => Math.floor(Math.random() * 255))
let spritePalette = new Array(256).fill(0x004004040040400400004004040040400400n)
let rom = emp.g2asm.parseAsm(await loadFile('./bios.asm')).result
let vdclrPre = ['#000','#888','#800','#740','#880','#680','#228','#508','#444','#ddd','#f44','#d80','#cc0','#9f4','#aae','#548']
let vdclr = [...vdclrPre]
let LogicalChip = {
    // MMIO Space
    baseAddr:           0x400,
    limit:              0x2ff,

    // Audio CARD CHIP remembers
    cardIndex:          0,
    cardSector:         0,
    cardBytesReaded:    0,

    // Audio LOGICAL CHIP remembers
    efectiveVideoModAdr:0,
    chipausfx:          0,

    // Port Data Read
    in(port) {

        // Card0 Reading
        if (port == 3 || port == 4) {
            this.cardBytesReaded ++;
            return card != null ? card[this.cardIndex + (port - 3)] : 0;
        }

        // Card0 Present
        else if (port == 0x00)
            return Array.isArray(card) ? 0x00 : 0xFF;

        // GPU Warns
        else if (port == 0x30) {
            return Number(countQuedRender > (maxRenderRegresiveCountValue / 1.2));
        }

        else if (port == 0x40) {
            return kybuf.shift() ?? 0;
        }
    
        // Keyboard Controller
        else if(port == 0x41) 
            return showingCursor ? Math.ceil(pentouchx) : 0
        else if(port == 0x42) 
            return showingCursor ? Math.ceil(pentouchy) : 0
        else if(port == 0x43) 
            return isDraggin && showingCursor ? 1 : 0;

        return 0;
    },

    // Port Data Write
    out(port, data) {
        // Card0 Sector set
        if (port == 1) {
            this.cardSector = (this.cardSector & 0xFF) | (data << 8);
            this.cardIndex = this.cardSector * 512;
        }
        else if (port == 2) {
            this.cardSector = (this.cardSector & 0xFF00) | data;
            this.cardIndex = this.cardSector * 512;
        }

        // Card0 stepper
        else if (port == 5) {
            this.cardIndex += data;
        }

        // Keyboard Controller
        else if (port == 0x43) {
            showingCursor = Boolean(data & 1);
        }

        // Logical CPU Extender
        else if (port == 0x101)
            lif = true;
        else if (port == 0x100) {
            pc = (cpu.rex(sp) << 8) | cpu.rex(sp+1) - ((rtins & 0x800000) == 0x800000 ? 3 : 2);
            sp+=2;
        }

        // GPU Actions
        else if (port == 0x200) {
            this.efectiveVideoModAdr = data;
        }
        else if (port == 0x201) {
            GPUCHIPMake((this.efectiveVideoModAdr << 8) | data);
        }

        // Audio Chip Interactions
        else if (port == 0x50)
            chipau.switchWorkChannel(data);
        else if (port == 0x51)
            chipau.switchWorkChType(data)
        else if (port == 0x52)
            this.chipausfx = data;
        else if (port == 0x53)
            chipau.switchChannelFreq((this.chipausfx << 8) | data);
    }
}

function GPUCHIPGetRenderList(bt) {
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
function GPUCHIPGetListForSprite(sprite0) {
    let sprite = sprite0 & 0xFFFFFF_FFFFFF_FFFFFF_FFFFFF_FFFFFF_FFFFFFn;
    let rows = [];

    for (let y = 0; y < 6; y++) {        
        rows.push(GPUCHIPGetRenderList(Number(sprite & 0xFFFFFFn)));
        sprite = sprite >> 24n;
    }

    return rows.reverse();
}
function GPUCHIPDrawSprite(sprite0, x0, y0, putPixel) {
  let sprite = GPUCHIPGetListForSprite(sprite0);

  sprite.forEach((v, i) => {
    v.forEach((v2, i2) => {
        putPixel(x0 + i2, y0 + i, v2);
    })
  })
}
function GPUCHIPDrawPixel(x, y, color) {
  videoctx.fillStyle = color;
  videoctx.fillRect(x,y,1,1);
}
function GPUCHIPRefresh() {
  // Rendering Loop
  for (let a = 0; a < 12; a++) {
        for (let b = 0; b < 16; b++) {
            // Sprite Drawing
            GPUCHIPDrawSprite(
                spritePalette[vram[(a * 16) + b]], 
                b * 6, a * 6, 
                GPUCHIPDrawPixel)
        }
  }

  // If Mouse Showing
  if (showingCursor && showerMouseHs) {
    videoctx.fillStyle = '#ffffff';
    
    // Mouse Block
    if (isDraggin) {
        videoctx.fillRect(Math.ceil(Math.ceil(pentouchx) * 6),Math.ceil(Math.ceil(pentouchy) * 6),6,6);
    }
    // Blinker
    else {
        if (new Date().getMilliseconds() < 500) 
            videoctx.fillStyle = '#ffffff77'
        videoctx.fillRect(Math.ceil(Math.ceil(pentouchx) * 6),Math.ceil(((pentouchy) * 6) + 4),4,2);
    }
  }
}
function GPUCHIPMake(adr) {
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
    // Change Color Global Scheme
    if (action == 1) {
        let from = cpu.rex(adr + 1);
        let count = cpu.rex(adr + 2);

        let ptr = adr + 3;
        while (count != 0) {
            vdclr[from] = vdclrPre[cpu.rex(ptr)];
            ptr++;
            from++;
            count--;
        }
    }
}
function GPUCHIPStep() {
    if (countQuedRender == 0) {
        countQuedRender = maxRenderRegresiveCountValue;
        GPUCHIPRefresh();
    } else countQuedRender--;
}
function CPUPause() {
    if (!window.halted) {
        videoctx.canvas.style.filter = 'brightness(0.4)'
    }
    else {
        videoctx.canvas.style.filter = 'brightness(1)'
    }

    window.halted = !window.halted;
}
function EMULATORReset() {
    videoctx.canvas.style.filter = 'brightness(1)'

    spritePalette[0] = 0x004004040040400400004004040040400400n;
    window.halted = true;
    for (let index = 32; index < 91; index++) {
        spritePalette[index] = knowPresets[index - 32];
    }

    vdclr = [...vdclrPre]

    ram0.fill(0);
    tmpm0.fill(0);
    vram.fill(32)

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
function LOGICStep() {
    // Set Information Of Instructions
    let ins = [cpu.rex(pc), cpu.rex(pc+1), cpu.rex(pc+2)];
    rtins = ((ins[0] << 16) | (ins[1] << 8) | ins[2])

    // Instruction Disasembler
    if (window.halted) {
        statar.textContent = `Card0 Controller

Index           : ${LogicalChip.cardIndex}
Sector          : ${LogicalChip.cardSector}
Bytes Readed    : ${LogicalChip.cardBytesReaded}
Sectors Readed  : ${Math.ceil(LogicalChip.cardBytesReaded / 512)}
Steps for refresh:${countQuedRender}

`

        // Calculate Instruccion Size
        let rta = (rtins & 0x800000) == 0x800000 ? ins.slice(0, 3) : ins.slice(0, 2);

        // Show Instruction info
        dbglog.textContent += pc.toString(16).padStart(4, '0').toUpperCase() + ' ' + rta.map(v => v.toString(16).padStart(2,'0')).join('').toUpperCase().padEnd(8, ' ') +  emp.g2asm.LineDisasm(ins)+ "\n";
    
        document.getElementById('regDbg').textContent = `A=${cpu.getRegister(0).toString(16).padStart(4, '0')} X=${cpu.getRegister(1).toString(16).padStart(4, '0')} Y=${cpu.getRegister(2).toString(16).padStart(4, '0')} Z=${cpu.getRegister(3).toString(16).padStart(4, '0')} F=${cpu.flags.join('')}`
        dbglog.scrollTop = dbglog.scrollHeight;
    }

    let kat = cpu.exi(rtins);
    pc = pc + kat
}
function CPUReadMake(adr2) {
    let adr = adr2 & 0xFFF;

    //TmpMem0
    if (adr >= 0x80 && adr < 0x100) 
        return tmpm0[adr - 0x80];

    // STDRom
    if (adr >= 0xF00 && adr < 0xFFF) 
        return rom[adr - 0xF00];

    // Mapped Devices Controller
    if (adr >= LogicalChip.baseAddr && adr <= (LogicalChip.baseAddr + LogicalChip.limit))
        return LogicalChip.in(adr - LogicalChip.baseAddr);

    // GPU Vram
    if (adr >= 0x340 && adr < (0x340 + vram.length))
        return vram[adr - 0x340]; 

    // Ram0
    if (adr >= 0x700 && adr < (0x700 + ram0.length))
        return ram0[adr - 0x700];

    return 0;
};
function CPUWriteMake(adr2, val) {
    let adr = adr2 & 0xFFF;

    // TmpMem0
    if (adr >= 0x80 && adr < 0x100) 
        tmpm0[adr - 0x80] = val;

    // Mapped Devices Controller
    if (adr >= LogicalChip.baseAddr && adr <= (LogicalChip.baseAddr + LogicalChip.limit))
        LogicalChip.out(adr - LogicalChip.baseAddr, val);

    // GPU Vram
    if (adr >= 0x340 && adr < (0x340 + vram.length))
        vram[adr - 0x340] = val; 

    // Ram0
    if (adr >= 0x700 && adr < (0x700 + ram0.length))
        ram0[adr - 0x700] = val;
}
function CPUJumpMake(adr) {
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
function EMULATORAlternateTurbo() {
    turbo_mode = !turbo_mode;
}
function EMULATORInit() {
    cpu.jf =            CPUJumpMake;
    cpu.rex =           CPUReadMake;
    cpu.wex =           CPUWriteMake;

    window.cpuReset =   EMULATORReset;
    window.cpuPau =     CPUPause;
    window.turboalt =   EMULATORAlternateTurbo;

    window.halted =     true;
    window.step =       function () { 
        LOGICStep();
        GPUCHIPStep();
    }

    cpu.rst();
    LOGICStep();

    board.focus();
}
function EMULATORKeyIntercept(ev) {
    let k = ev.key.toUpperCase();
    if (k == 'K') {
        videoctx.canvas.requestPointerLock();
    }

    else if (k == 'E') {
        CARD0Eject();
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
function goFullscreen(){
  let c = videoctx.canvas;
  if(c.requestFullscreen) 
    c.requestFullscreen();
  else if(c.webkitRequestFullscreen) 
    c.webkitRequestFullscreen();
}
function exitFullscreen(){
  if(document.exitFullscreen) 
    document.exitFullscreen();
}
function CARD0Eject() {
    cardstyle.title = 'click to insert a card of bit by inverted binary braile';
    card = null;
    cardstyle.className = 'cardNoPresent';
}
// Emulator Pointer Locking
videoctx.canvas.addEventListener('pointerlockchange', () => {
  isDraggin = (document.pointerLockElement === videoctx.canvas)
});
// Emulator Insert Card0
input.addEventListener('change', async (e)=>{
    /** @type {File} */
  const file = e.target.files[0];

  // If File Pressent
  if(file) {
        cardstyle.className = 'cardInserted';

        let isAsm = file.name.toLowerCase().endsWith('.asm') || file.name.toLowerCase().endsWith('.s')
        let cardVrtName = file.name.toUpperCase();
        let that = cardVrtName.slice(0, 13);

        // Compilation Of Assembler
        if (isAsm) {
            that = cardVrtName.split('.')[0];
            card = emp.g2asm.parseAsm((await file.text())).result;
            LogicalChip.cardBytesReaded = 0;
            console.log(card.length)
        }
        else {
            const buf = await file.arrayBuffer();
            card = Array.from(new Uint8Array(buf));
            LogicalChip.cardBytesReaded = 0;
            console.log(card.length)
        }

        cardstyle.title = 'click to eject ' + that
    }
});
board.addEventListener('keydown', EMULATORKeyIntercept);
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
document.addEventListener('keydown', e => {
  if(e.key === 'f' || e.key === 'F'){
    if(!document.fullscreenElement) goFullscreen();
    else exitFullscreen();
  }
});
window.sendIonj = function(s) {
    kybuf.push(s)
}
cardstyle.addEventListener('click', () => {
    if (card) {
        CARD0Eject();
    }
    else { 
        document.getElementById('CardSdSelect').click();
    }
})

cardstyle.title = 'click to insert a card of bit by inverted binary braile';

window.palette = spritePalette

EMULATORInit();
EMULATORReset();
window.halted = true;

// Cpu Instruction Autoexecuted
setInterval(function () {
    if (!window.halted) {
        for (let index = 0; index < 1600 * (turbo_mode ? 10 : 1); index++) {
            LOGICStep();
            GPUCHIPStep();
        }
    }
}, 50);