export class AudioChip {
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