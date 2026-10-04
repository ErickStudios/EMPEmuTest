
    local 700h

    jmp $start

tmp1 equ 80h
tmp2 equ 82h
tmp3 equ 84h

row equ 9fh
col equ 9eh

    ; sprite = A
tty:
    tia $10
    lcf $1
    bcf $.nl

    lbx %z $row
    chy $16
    mul %x %y
    lby %z $col
    add %x %y
    sba %x $340h

    lba %z $col
    add $1
    sba %z $col

    lbx %z $row
    tix $12
    lcf $2
    bcf $.res

    jmp $.ars

.res:

    sbz %z $500h

.nl:
    sbz %z $col
    lba %z $row
    add $1
    sba %z $row
    lbx %z $row
    tix $12
    lcf $2
    bcf $.res2
    jmp $.ars
.res2:
    sbz %z $500h

.ars:
    sba %z $tmp1
    stx %z $tmp2

    sbz %z $501h
    jmp $cls

    ldx %z $tmp2
    lba %z $tmp1

    sbz %z $row
    sbz %z $col
    sbz %z $500h

    ; X == Y brk at A
strcmp:
    sta %z $tmp1
    stx %z $tmp2
    sty %z $tmp3
.cmp:
    lda %z $tmp1
    tsa %z ; test if end
    lcf $1
    bcf $.end

    ldx %z $tmp2
    ldy %z $tmp3
    lbx %x $0
    lby %y $0
    sub %x %y
    tsx %z ; zero
    lcf $1
    bcf $.nxt

    sub %a %a
    add %a %x
    sbz %z $500h

.nxt:
    ldx %z $tmp2
    ldy %z $tmp3
    cha $1
    add %x %a
    add %y %a
    stx %z $tmp2
    sty %z $tmp3
    lda %z $tmp1
    sub $1
    sta %z $tmp1
    jmp $.cmp
.end:
    sub %a %a
    sbz %z $500h

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
    sbz %z $500h

start:
    cha $1
    sba %z $443h

render:
    sbz %z $501h
    jmp $cls
    lba %z $442h
    mul $16
    lbx %z $441h
    add %a %x
    chy $'X'
    sby %a $340h
.sleep:
    lba %z $430h ; screen is give the signal to a comming refresh
    tsa %z
    lcf $1
    bcf $.sleep
    jmp $render