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

let kybuf = [];
let pc = 0xFFC;
let sp = 0xF00;
let lif = false;
let rtins = 0;
let card = emp.g2asm.parseAsm(await loadFile('./play0.asm')).result;
let ram0 = new Array(0x800).fill(0);
let tmpm0 = new Array(0x80).fill(0);
let vram = new Array(16*12).fill(0).map(v => Math.floor(Math.random() * 255))
let spritePalette = Array.from({ length: 256 }, () => {
  let bra = new Array(6).fill(0).map(v => Math.floor(Math.random() * 0xFFFFFF));
  
  let nara = 0n;
  bra.forEach(v => {
    nara = nara << 24n
    nara = nara | BigInt(v);
  })

  return nara;
});

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

    requestAnimationFrame(render);
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

    // Port Data Read
    in(port) {
        if (port == 3 || port == 4) {
            this.cardBytesReaded ++;
            return card[this.cardIndex + (port - 3)];
        }

        else if (port == 0x40) {
            return kybuf.shift();
        }

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
        else if (port == 0x101) {
            lif = true;
        }
        else if (port == 0x200) {
            this.efectiveVideoModAdr = data;
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

videoctx.canvas.addEventListener('click', () => {
    videoctx.canvas.focus();
});

videoctx.canvas.addEventListener('keydown', (ev) => {
    if (ev.key.length == 1) {
        kybuf.push(ev.key.toUpperCase().charCodeAt(0))
    } else if (ev.key == 'Enter') {
        kybuf.push(10)
    }
})

const input = document.getElementById('CardSdSelect');
const label = document.getElementById('cardName');

input.addEventListener('change', async (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  label.textContent = file.name.slice(0,13).toUpperCase();
  const buf = await file.arrayBuffer();
  card = new Uint8Array(buf);
  prt_dev.cardBytesReaded = 0;
});

window.cpuReset = function() {
    window.halted = true;
    cpu.rst();
    pc = 0xFFC;
    sp = 0xF00;
    window.halted = false;

    kybuf.splice(0, kybuf.length);
}

window.sendIonj = function(s) {
    kybuf.push(s)
}

// Cpu Instruction Autoexecuted
setInterval(function () {
    if (!window.halted) {
        for (let index = 0; index < 400; index++) {
            step();
        }
    }
}, 50);