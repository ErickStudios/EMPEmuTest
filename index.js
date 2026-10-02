import * as emp from "https://cdn.jsdelivr.net/gh/ErickStudios/EMP-Arch@main/Toolchain/libemp.js"

let cpu = new emp.cpuGen1(1028);

const jit_rom = emp.compiler.make(await loadFile('./std.asm'));
const jit_card = emp.compiler.make(await loadFile('./gfx.asm')).result;

async function loadFile(fnam) {
  const url = new URL(fnam, import.meta.url)
  const txt = await fetch(url).then(r => r.text())
  return txt;
}

const jit_code = jit_rom.result;
const logArea = document.getElementById('debugLog');
/** @type {HTMLCanvasElement} */
const video = document.getElementById("video");
//const lttr = document.getElementById("lttr");
const videoctx = video.getContext("2d");
//const lttrctx = lttr.getContext("2d");
var vidmem = new Array(20*15).fill(0).map(v => Math.floor(Math.random() * 255))
var vidpre = Math.floor(Math.random() * 127);
const dbg_reg = document.getElementById("debugReg");
let inputSenderList = [];
let ram0 = new Array(1024).fill(0);
let spritePalette = Array.from({ length: 256 }, () => {
  let pal = Math.floor(Math.random() * 0x10000); // 0..FFFF
  let til = Math.floor(Math.random() * 0x100000000); // 0..FFFFFFFF
  
  return (BigInt(pal) << 32n) | BigInt(til);
});


let sndDrv = {
  ctx: null,
  channels: [],
  fnInd: 0xFF,
  
  init() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    // 4 canales: 0-1 cuadradas, 2 triangular, 3 ruido (extra)
    for(let i=0;i<4;i++){
      let osc = this.ctx.createOscillator();
      let gain = this.ctx.createGain();
      gain.gain.value = 0;
      osc.type = i<2 ? 'square' : i===2 ? 'triangle' : 'sawtooth';
      osc.start();
      osc.connect(gain).connect(this.ctx.destination);
      this.channels.push({osc, gain, playing: false});
    }
  },

  // freq en Hz = 440 * 2^((midi-69)/12)
  // tu pasas nota MIDI 0-127 o periodo GameBoy
  mk(ptr){
    if(!this.ctx) this.init();
    if(this.ctx.state==='suspended') this.ctx.resume();

    switch(this.fnInd){
      case 0x0: { // CH0 SQUARE: [nota:u8][vol:0-15][duty:0-3]
        let note = cpu.rex(ptr);
        let vol = cpu.rex(ptr+1) & 0xF;
        let duty = cpu.rex(ptr+2) & 0x3;
        let ch = this.channels[0];
        
        let freq = 440 * Math.pow(2, (note - 69)/12);
        ch.osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        // duty hack para square: no hay duty en WebAudio, lo simulamos con periodicWave si quieres
        ch.gain.gain.setValueAtTime(vol/15 * 0.3, this.ctx.currentTime);
        break;
      }
      case 0x1: { // CH2 TRIANGLE: [nota:u8][vol:0-15]
        let note = cpu.rex(ptr);
        let vol = cpu.rex(ptr+1) & 0xF;
        let ch = this.channels[2];
        let freq = 440 * Math.pow(2, (note - 69)/12);
        ch.osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        ch.gain.gain.setValueAtTime(vol/15 * 0.4, this.ctx.currentTime);
        break;
      }
      case 0x2: { // STOP ALL
        this.channels.forEach(c=> c.gain.gain.setValueAtTime(0, this.ctx.currentTime));
        break;
      }
      case 0x3: { // PLAY FREQ directa: [freq_lo][freq_hi][vol][wave:0=square,1=tri]
        let lo = cpu.rex(ptr);
        let hi = cpu.rex(ptr+1);
        let freq = (hi<<8)|lo; // 0-65535 Hz directo
        let vol = cpu.rex(ptr+2) & 0xF;
        let wave = cpu.rex(ptr+3);
        let ch = this.channels[wave===1?2:0];
        ch.osc.type = wave===1 ? 'triangle' : 'square';
        ch.osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        ch.gain.gain.setValueAtTime(vol/15*0.3, this.ctx.currentTime);
        break;
      }
    }
    this.fnInd = 0xFF;
  }
}

let card = jit_card; // 6K of mem 0x800-0x2000
let cardDrv = {
  size: 0x1800,
  mmio: 0x800,
  rdr(adr) {
    if (card) return card[adr % 0x1800];
    return 0;
  },
}

let gpuDrv = {
  fnInd: 0xFF,
  mk(i16) {
    switch (this.fnInd) {
      // Cambiar indice de colores
      case 0x0:
        let from = cpu.rex(i16);
        let to = from + cpu.rex(i16 + 1);
        let cpui = i16 + 2;

        for (let index = from; index < to; index++) {
          let b0 = BigInt(cpu.rex(cpui));
          let b1 = BigInt(cpu.rex(cpui+1));
          let b2 = BigInt(cpu.rex(cpui+2));
          let b3 = BigInt(cpu.rex(cpui+3));
          let b4 = BigInt(cpu.rex(cpui+4));
          let b5 = BigInt(cpu.rex(cpui+5));

          let clr = (b0 << 40n) | (b1 << 32n) | (b2 << 24n) | (b3 << 16n) | (b4 << 8n) | b5;

          spritePalette[index] = clr;
          cpui += 7;
        }

        break;
    
      default:
        break;
    }
  }
}

sndDrv.init()
console.log(jit_code)

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

function putPixel(x, y, color) {
  videoctx.fillStyle = color;
  videoctx.fillRect(x,y,2,2);
}

function createTileMaker() {
  let mn = document.createElement("div");
  mn.style.cssText = "position:fixed;top:10px;right:10px;background:#111;padding:10px;border:1px solid #555;font-family:monospace;color:#fff;z-index:9999";
  mn.innerHTML = `
    <h1 style="margin:0 0 8px 0;font-size:12px">TILE MAKER 4x4</h1>
    <canvas width="64" height="64" style="image-rendering:pixelated;border:1px solid #fff;cursor:crosshair"></canvas>
    <div style="margin:6px 0;display:flex;gap:4px"></div>
    <div style="margin:6px 0;display:flex;gap:4px"></div>
    <pre style="font-size:10px;margin:6px 0;word-break:break-all"></pre>
  `;

  let canvas = mn.querySelector("canvas");
  let ctx = canvas.getContext("2d");
  let palRow = mn.children[1].nextElementSibling; // segundo div
  let idxRow = mn.children[1].nextElementSibling.nextElementSibling;
  let out = mn.querySelector("pre");

  // fix del innerHTML parsing, mejor agarramos bien:
  let divs = mn.querySelectorAll("div");
  palRow = divs[0];
  idxRow = divs[1];

  let curPal = [0x0, 0x8, 0x2, 0x6]; // [negro, trans, verde, amarillo]
  let curIdx = 2;
  let pixels = Array.from({length:4},()=>Array(4).fill(0));

  function makeTile(pal, px){
    let palN = ((pal[0]&0xF)<<12)|((pal[1]&0xF)<<8)|((pal[2]&0xF)<<4)|(pal[3]&0xF);
    let til=0;
    for(let y=0;y<4;y++){
      let row=0;
      for(let x=0;x<4;x++) row=(row<<2)|(px[y][x]&3);
      til=(til<<8)|row;
    }
    return (BigInt(palN)<<32n)|BigInt(til);
  }

  function draw(){
    ctx.clearRect(0,0,64,64);
    for(let y=0;y<4;y++){
      for(let x=0;x<4;x++){
        let p = curPal[pixels[y][x]];
        let br = (p>>3)&1, rgb=p&7;
        if(rgb===0 && br===1) ctx.fillStyle="#222";
        else ctx.fillStyle = color4ToXd({rgb, bright:br}) || "#000";
        ctx.fillRect(x*16,y*16,16,16);
      }
    }
    ctx.strokeStyle="#333"; ctx.lineWidth=0.5;
    for(let i=1;i<4;i++){ ctx.beginPath(); ctx.moveTo(i*16,0); ctx.lineTo(i*16,64); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0,i*16); ctx.lineTo(64,i*16); ctx.stroke(); }

    let tile = makeTile(curPal, pixels);
    let hex = tile.toString(16).padStart(12,'0').toUpperCase();
    let palHex = hex.slice(0,4);
    let tilHex = hex.slice(4);

    // AQUI esta la paleta visible
    out.textContent = `0x${curPal.map(v=>v.toString(16)).join('')}${hex}n\n`;

    // FIX: era idxRow, no palRow
    [...idxRow.children].forEach((b,i)=> b.style.outline = i===curIdx? "2px solid white" : "none");
  }

  // crea botones de paleta (color real)
  curPal.forEach((c,i)=>{
    let b=document.createElement("button");
    b.style.cssText="width:24px;height:24px;border:1px solid #fff;padding:0";
    let br=(c>>3)&1, rgb=c&7;
    b.style.background = (rgb===0&&br===1)? "repeating-linear-gradient(45deg,#222,#222 4px,#444 4px,#444 8px)" : color4ToXd({rgb,bright:br});
    b.onclick=()=>{
      let v=prompt(`Color ${i} en hex 0x0-0xF (0bB_RGB, 8=transparent):`, "0x"+c.toString(16));
      if(v!==null){ curPal[i]=parseInt(v)&0xF; b.style.background = color4ToXd({rgb:curPal[i]&7, bright:(curPal[i]>>3)&1}) || "#222"; draw(); }
    };
    palRow.appendChild(b);
  });

  // botones de indice 0..3
  for(let i=0;i<4;i++){
    let b=document.createElement("button");
    b.textContent=i; b.style.width="24px";
    b.onclick=()=>{ curIdx=i; draw(); };
    idxRow.appendChild(b);
  }

  canvas.onclick=e=>{
    let r=canvas.getBoundingClientRect();
    let x=Math.floor((e.clientX-r.left)/r.width*4);
    let y=Math.floor((e.clientY-r.top)/r.height*4);
    pixels[y][x]=curIdx;
    draw();
  };
  canvas.onmousemove=e=>{
    if(e.buttons!==1) return;
    let r=canvas.getBoundingClientRect();
    let x=Math.floor((e.clientX-r.left)/r.width*4);
    let y=Math.floor((e.clientY-r.top)/r.height*4);
    if(pixels[y]?.[x]!==undefined){ pixels[y][x]=curIdx; draw(); }
  };

  document.body.appendChild(mn);
  draw();
  return mn;
}

//createTileMaker();

// struct tile {
//  uint16_t pal; // 0bAAAABBBBCCCCDDDD = [0]:[1]:[2]:[3]
//                // black (0b000) & br=1 == transparent
//                // any other color (0bRGB) & br = 1 == color * (mod+1)
//  uint32_t til; // 4x4x2 sprite body
// };
function drawSprite(sprite0, x0, y0, putPixel) {
  let sprite = sprite0 & 0xFFFF_FFFFFFFFn;
  let pal = Number(sprite >> 32n);
  let til = Number(sprite & 0xFFFFFFFFn);

  const pals = [
    (pal >> 12) & 0xF,
    (pal >> 8) & 0xF,
    (pal >> 4) & 0xF,
    pal & 0xF
  ].map(n => {
    const b = (n >> 3) & 1;
    const rgb = n & 0b111;
    if (rgb === 0 && b === 1) return null;
    return { rgb, bright: b, raw: n };
  });

  const rows = [
    (til >> 24) & 0xFF,
    (til >> 16) & 0xFF,
    (til >> 8) & 0xFF,
    til & 0xFF
  ];

  for (let y = 0; y < 4; y++) {
    let row = rows[y];
    for (let x = 0; x < 4; x++) {
      // byte = [p0:7-6][p1:5-4][p2:3-2][p3:1-0]
      let shift = 6 - (x * 2);
      let idx = (row >> shift) & 0b11;

      let color = pals[idx];
      if (color === null) continue;

      putPixel(x0 + (x * 2), y0 + (y * 2), color4ToXd(color));
    }
  }
}

// Dibuja una letra
function drawChar(r, c, chr) {
  videoctx.font = "8px 'Press Start 2P', monospace";
  videoctx.textBaseline = "top";
  videoctx.fillStyle = "#d4cced";
  videoctx.fillText(chr[0], r * 8, c* 8);
}

// Renderiza la Pantalla
function render() {
  videoctx.clearRect(0,0, 160, 120)

  let mba = 0;
  for (let a = 0; a < 15; a++) {
    for (let b = 0; b < 20; b++) {
      drawSprite(spritePalette[vidmem[mba]], b * 8, a * 8, putPixel)
      //drawChar(b, a, String.fromCharCode(vidmem[a*20+b]))
      mba++;
    }
  }

  /*
  lttrctx.clearRect(0,0, 8, 8)
  lttrctx.font = "8px 'Press Start 2P', monospace";
  lttrctx.textBaseline = "top";
  lttrctx.fillStyle = "#d4cced";
  lttrctx.fillText(String.fromCharCode(vidpre), 0, 0);*/
}

render()

// Funcion de escritura de memoria
cpu.wex = (adr, val) => {
  // La primera ram la principal
  if (adr < 0x400) {
    ram0[adr] = val;
  }

  // Escribir RAM de video
  if (adr >= 0x400 && adr < (0x400 + (20*15))) { 
    vidmem[adr - 0x400] = val;
    render()
  }

  // Dispositivos mapeados
  if (adr >= 0xD000 && adr < 0xD400) {
    switch (adr - 0xD000) {
      // Previa del video
      case 0x10:
        vidpre = val;
        render()
        break;
      case 0x101:
        break;
      default:
        break;
    }
  }
}

// Funcion para leer memoria
cpu.rex = (adr) => {
  // La primera ram la principal
  if (adr < 0x400) {
    return ram0[adr];
  }

  if (adr >= cardDrv.mmio && adr < (cardDrv.mmio + cardDrv.size)) 
    return cardDrv.rdr(adr - cardDrv.mmio)

  // Leer ram de video
  if (adr >= 0x400 && adr < 0x400 + (20*15)) return vidmem[adr - 0x400];

  // Leer datos de la ROM
  if (adr >= 0xE000) return jit_code[adr - 0xE000];

  // Dispositivos mapeados
  if (adr >= 0xD000 && adr < 0xD400) {
    switch (adr - 0xD000) {
      // Previa del video
      case 0x10:
        return vidpre;

      // Estado del teclado
      case 0x60:
        return Number(inputSenderList.length !== 0);
      // Reservado para por si añado una pantalla tactil
      case 0x62:
        return 0x1F; // unsupported
    
      // Obtener Teclas
      case 0x61:
        return inputSenderList.shift();

      // Estado del cartucho
      case 0x90:
        return card ? 0x00 : 0xFF;

      // Dispositivo no valido
      default:
        return 0xFF;
    }
  }
  return 0;
}
cpu.jf = (adr) => {
  if (lnkFlag) {
    lnkFlag = false;
    cpu.wex(sp, (pc >> 8) & 0xFF)
    cpu.wex(sp+1, pc & 0xFF);
    sp -= 2;
  }
  pc = adr - 2;
}

window.halted = true;

cpu.hlp = (ins) => {
  if (ins == 0x5001) {
    lnkFlag = true;
  }
  else if (ins == 0x5000) {
    sp += 2;
    pc = (cpu.rex(sp) << 8) | cpu.rex(sp+1);
    console.log(pc, cpu.rex(sp), cpu.rex(sp+1))
  }
  else if (((ins >> 4) & 0xFFF) == 0x520) {
    cpu.wex(sp, cpu.getReg(ins & 0xF));
    sp--;
  }
  else if (((ins >> 4) & 0xFFF) == 0x521) {
    sp++;
    cpu.setReg(ins & 0xF, cpu.rex(sp));
  }
  else if (((ins >> 8) & 0xFF) == 0x51) {
    sp = (cpu.getReg((ins >> 4) & 0xF) << 8) | cpu.getReg(ins & 0xF);
  }
  else if (((ins >> 8) & 0xFF) == 0x24) {
    gpuDrv.fnInd = ins & 0xFF;
  }
  else if (((ins >> 8) & 0xFF) == 0x25) {
    let ia = (cpu.getReg((ins >> 4) & 0xF) << 8) | cpu.getReg(ins & 0xF);
    gpuDrv.mk(ia);
  }
  else if (((ins >> 8) & 0xFF) == 0x26) {
    sndDrv.fnInd = ins & 0xFF;
  }
  else if (((ins >> 8) & 0xFF) == 0x27) {
    let ia = (cpu.getReg((ins >> 4) & 0xF) << 8) | cpu.getReg(ins & 0xF);
    sndDrv.mk(ia);
  }
}

// Paso del CPU
window.step = () => {
  if (window.halted) dbg_reg.textContent = `A=${cpu.ar.toString(16).padStart(2,'0')}\nB=${cpu.br.toString(16).padStart(2,'0')}\nC=${cpu.cr.toString(16).padStart(2,'0')}\nP=${cpu.pr.toString(16).padStart(2,'0')}\nW=${cpu.altpr.toString(16).padStart(2,'0')}\nM=${cpu.alt2r.toString(16).padStart(2,'0')}\nX=${cpu.xr.toString(16).padStart(2,'0')}\nY=${cpu.yr.toString(16).padStart(2,'0')}\nZ=${cpu.zr.toString(16).padStart(2,'0')}\nF=${cpu.fr}`

  let ins = (cpu.rex(pc) << 8) | cpu.rex(pc+1);

  if (window.halted) {
    let xda = emp.compiler.inspect([ins >> 8, ins & 0xFF]);
    if (ins == 0x5001) xda = 'LNK';
    else if (ins == 0x5000) {
      xda = 'RET';
    }
    else if (((ins >> 8) & 0xFF) == 0x51) {
      xda = 'MSP' + emp.compiler.inspect([0,(ins >> 4) & 0xF]).substring(3) + emp.compiler.inspect([0, ins & 0xF]).substring(3);
    }
    else if (((ins >> 4) & 0xFFF) == 0x520) {
      xda = 'PSH' + emp.compiler.inspect([0, ins & 0xFF]).substring(3);
    }
    else if (((ins >> 4) & 0xFFF) == 0x521) {
      xda = 'POP' + emp.compiler.inspect([0, ins & 0xFF]).substring(3);
    }
    else if (((ins >> 8) & 0xFF) == 0x24) {
      xda = 'GPX' + emp.compiler.inspect([4, ins & 0xFF]).substring(3);
    }
    else if (((ins >> 8) & 0xFF) == 0x25) {
      xda = 'GPU' + emp.compiler.inspect([0,(ins >> 4) & 0xF]).substring(3) + emp.compiler.inspect([0, ins & 0xF]).substring(3);
    }
    else if (((ins >> 8) & 0xFF) == 0x26) {
      xda = 'SNX' + emp.compiler.inspect([4, ins & 0xFF]).substring(3);
    }
    else if (((ins >> 8) & 0xFF) == 0x27) {
      xda = 'SND' + emp.compiler.inspect([0,(ins >> 4) & 0xF]).substring(3) + emp.compiler.inspect([0, ins & 0xF]).substring(3);
    }
    logArea.value += `${pc.toString(16).toUpperCase().padStart(4, '0')} ${[ins >> 8, ins & 0xFF].map(v => v.toString(16).padStart(2, '0')).join(" ")}    ${xda}\n`;
  }
  let ex = cpu.exi(ins);
  if (window.halted)  logArea.scrollTop = logArea.scrollHeight;
  pc += 2;
}

// Funcion de input de teclas
window.inputSend = (x) => {
  inputSenderList.push(x);
}

let pc = (cpu.rex(0xFFFC) << 8) | cpu.rex(0xFFFD);
let lnkFlag = false;
let sp = 0;

step();

const KEYMAP = {
  'a': 0, 'A': 0,
  'b': 1, 'B': 1,
  'y': 2, 'Y': 2,
  'x': 3, 'X': 3,
  'h': 4, 'H': 4,
  'o': 5, 'O': 5,
  ' ': 4,
  'Enter': 4
};

onkeydown = (ev) => {
  if (ev.repeat) return;
  let code = KEYMAP[ev.key];
  if (code !== undefined) {
      window.inputSend(code);
      ev.preventDefault();
  }
}

onkeyup = (ev) => {
}

// El modo de intervalo de auto ejecucion
setInterval(() => {
  if (!window.halted) { 
    let i = 2000;
    while (i--) {
      step();
    }
   }
}, 1)