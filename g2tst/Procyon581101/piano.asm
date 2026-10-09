
    local 700h

    sbz %z $450h
    sbz %z $451h

    cha $__resources
    sta %z $600h

cls:
    sub %y %y
.loop:
    cha $02020h
    sta %y $340h
    cha $2
    add %y %a
    tiy $0c0h
    lcf $2
    bcf $.loop

render:
    
    cha $1
    sba %z $(340h+32+16+5)
    sba %z $(341h+32+16+5)
    sbz %z $(342h+32+16+5)
    sba %z $(343h+32+16+5)
    sba %z $(344h+32+16+5)
    sba %z $(345h+32+16+5)
    sbz %z $(346h+32+16+5)

    sbz %z $(340h+32+32+5)
    sbz %z $(341h+32+32+5)
    sbz %z $(342h+32+32+5)
    sbz %z $(343h+32+32+5)
    sbz %z $(344h+32+32+5)
    sbz %z $(345h+32+32+5)
    sbz %z $(346h+32+32+5)

    cha $'A'
    sba %z $(340h+32+48+5)

    cha $'B'
    sba %z $(341h+32+48+5)

    cha $'X'
    sba %z $(342h+32+48+5)

    cha $'Y'

    sba %z $(343h+32+48+5)

    cha $'V'
    sba %z $(344h+32+48+5)

    cha $'N'
    sba %z $(345h+32+48+5)
    
    cha $'W'
    sba %z $(346h+32+48+5)

    tix $(16*3)

logical:
    lba %z $440h

    tsa %z
    lcf $1
    bcf $.tol

    stz %z $__margin

    add %a %a
    ldx %a $__keymap
    stx %z $452h

    jmp $render

.tol:
    lda %z $__margin
    tia $100
    lcf $2
    bcf $.nr

    cha $0
    stz %z $452h

.nr:
    add $1
    sta %z $__margin

    jmp $render

__margin word 0

__keymap:
    word 0, 60, 62, 64, 65, 71, 0, 0, 0, 0, 67, 0, 69

__resources:
    byte 0, 0, 2
    byte 0x19,0x99,0x91,0x19,0x99,0x91,0x19,0x99,0x91,0x19,0x99,0x91,0x19,0x99,0x91,0x19,0x99,0x91
    byte 0x19,0x00,0x91,0x19,0x00,0x91,0x19,0x00,0x91,0x19,0x99,0x91,0x19,0x99,0x91,0x19,0x99,0x91