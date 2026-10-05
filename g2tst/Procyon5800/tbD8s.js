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