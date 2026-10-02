
    local 800h
    jic $start

    def gpx (24h n)
    def gpu (25h (r r))
    def snx (26h n)
    def snd (27h (r r))

plt:
    byte 0, 1 ; start / len
    dw 0864h
    dd 28A20AA0h

sxf:
    db 78, 5, 0

start:
    gpx $0 ; act = set colors

    chh $plt.h
    cha $plt.l
    gpu %h %a

    snx $0
    chh $sxf.h
    cha $sxf.l
    snd %h %a

    str $400h, $0
    
    rsv (1800h-$)