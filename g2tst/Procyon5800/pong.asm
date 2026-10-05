
    local 700h

start:
    cha $assets
    sta %z $600h

render:
    sub %y %y
.cls:
    cha $02020h
    sta %y $340h
    cha $2
    add %y %a
    tiy $0c0h
    lcf $2
    bcf $.cls

    lba %z $player1
    lbx %z $player2
    chy $16

    mul %a %y
    mul %x %y
    
    sbz %a $(340h+1+16)

    sbz %x $(340h+14+16)

    lba %z $paly
    mul $16
    lbx %z $palx
    add %a %x
    
    chx $1
    sbx %a $340h

.waitl:
    lba %z $430
    tia $1
    lcf $1
    bcf $.waitl
logical:
    lba %z $440h
    tsa %z
    lcf $1
    bcf $.nokey

    chy $player1

    tia $3
    lcf $2
    bcf $.play1
    chy $player2
    sub $2
.play1:

    tia $3
    lcf $3
    bcf $.nokey

    lbx %y $0
    tia $2
    lcf $1
    div %a %a
    bcf $.down
    sub %x %a
    jmp $.nextlo
.down:
    add %x %a
.nextlo:
    sbx %y $0
.nokey:

    lba %z $gc
    tsa %z
    lcf $1
    bcf $.ka
    jmp $.kat
.ka:
    cha $1
    sba %z $gc
    jmp $.lan
.kat:
    sbz %z $gc

    chx $1
    lba %z $paly
    tsa %z
    lcf $3
    bcf $.ta
    sbx %z $diry
.ta:
    tia $11
    lcf $2
    bcf $.ta2
    sbz %z $diry
.ta2:
    chx $1
    lba %z $palx
    tsa %z
    lcf $3
    bcf $.te
    sbx %z $dirx
.te:
    tia $15
    lcf $2
    bcf $.te2
    sbz %z $dirx
.te2:

; ** colision player 1 **
    lba %z $player1
    lbx %z $paly
    add $1
    tsa %x
    lcf $1
    bcf $.cc1
    jmp $.ce1
.cc1:
    lba %z $palx
    tia $2
    lcf $1
    bcf $.y1
    jmp $.ce1
.y1:
    jmp $.y1
.ce1:

.li:

    lba %z $palx
    lbx %z $dirx

    tsx %z
    lcf $1
    bcf $.nat
    add $1
    jmp $.nit
.nat:
    sub $1
.nit:
    sba %z $palx

    lba %z $paly
    lbx %z $diry

    tsx %z
    lcf $1
    bcf $.nat1
    add $1
    jmp $.nit2
.nat1:
    sub $1
.nit2:
    sba %z $paly

.lan:

.waitr:
    lba %z $430h
    tsa %z
    lcf $1
    bcf $.waitr
    jmp $render

player1 byte 3 ; pos y
player2 byte 3 ; pos y
gc      byte 0  ; game make
palx    byte 8  ; ball x
paly    byte 5  ; ball y
dirx    byte 1  ; ball dir x
diry    byte 0  ; ball dir y

assets:
    byte 0, 0, 2
    byte 0xee,0xee,0xee,0xee,0xee,0xee,0xee,0xee,0xee,0xee,0xee,0xee,0xee,0xee,0xee,0xee,0xee,0xee
    byte 0x66,0x22,0x66,0x62,0xa9,0x26,0x22,0xaa,0xaa,0x22,0x2a,0xa2,0x62,0x22,0x26,0x66,0x22,0x66