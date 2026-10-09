
    ; LET X IS 10
    ; PRINT X
    ; LET X ADD 1
    ;
    ; POKE ADR V
    
    ; A-Z = 26 LETS * 2 = 40 + 12 = 52 bytes

    local 1000h

    row equ 9fh
    col equ 9eh
    tmp1 equ 80h
    tmp2 equ 82h
    let1id equ 8ah
    letContents equ 700h
    inputCommand equ 800h
    addrToPut equ 0890h

    jmp $start

    ; X = BUFFER
execute:
    stx %z $tmp1

    ; LET
    ldy %x $0
    tiy $4C45h
    lcf $1
    bcf $.tryLet
    jmp $.isNotLet
.tryLet:
    lby %x $2
    tiy $54h
    lcf $1
    bcf $.isLet
    jmp $.isNotLet

; LET behavior
.isLet:
    cha $4
    add %x %a
    lba %x $0
    sub $65
    sba %z $let1id
    cha $2 ; skip name + space
    add %x %a
    
    ; IS statment
    lda %x $0
    tia $4953h
    lcf $1
    bcf $.letSetAbs

.letSetAbs:
    cha $3
    add %x %a

    sbz %z $501h
    jmp $getStatment
    lba %z $let1id
    mul $2
    sty %a $letContents
    sbz %z $500h

.isNotLet:
    ldy %x $0
    tiy $504fh
    lcf $1
    bcf $.tryPoke
    jmp $.isNotPoke

.tryPoke:
    ldy %x $2
    tiy $4b45h
    lcf $1
    bcf $.isPoke
    jmp $.isNotPoke

.isPoke:
    cha $5
    add %x %a

    sbz %z $501h
    jmp $getStatment

    sty %z $addrToPut

    cha $1
    add %x %a

    sbz %z $501h
    jmp $getStatment

    lda %z $addrToPut
    sby %a $0

    sbz %z $500h

.isNotPoke:

    ldy %x $0
    tiy $5045h
    lcf $1
    bcf $.tryPeek
    jmp $.isNotPeek

.tryPeek:
    ldy %x $2
    tiy $454bh
    lcf $1
    bcf $.isPeek
    jmp $.isNotPeek

.isPeek:
    chy $5
    add %x %y

    lba %x $0

    sub $65
    sba %z $let1id

    cha $2
    add %x %a

    sbz %z $501h
    jmp $getStatment

    lby %y $0
    mul $2

    sty %a $letContents

    sbz %z $500h

.isNotPeek:

    sbz %z $500h

    ; X = BUF, Y = VAL
getStatment:
    lba %x $0
    tia $64
    lcf $3
    bcf $.isLet

    jmp $getNumber
.isLet:
    sub $65
    mul $2
    ldy %a $letContents
    sbz %z $500h

    ; X= BUF, Y= num
getNumber:
    sub %y %y
.while:
    lba %x $0
    tia $48
    lcf $2
    bcf $.end

    cha $10
    mul %y %a
    lba %x $0
    tia $47
    lcf $3
    bcf $.ok

.end:
    sbz %z $500h

.ok:
    sub $48
    add %y %a
    cha $1
    add %x %a
    jmp $.while

start:
    sub %x %x
    sbz %z $inputCommand
.wait:
    lba %z $440h
    tsa %z
    lcf $1
    bcf $.wait

    tia $10
    lcf $1
    bcf $.endIo

    sba %x $inputCommand

    stx %z $tmp2
    sbz %z $501h
    jmp $tty
    ldx %z $tmp2

    cha $1
    add %x %a

    jmp $.wait
.endIo:
    cha $10
    sbz %z $501h
    jmp $tty

    chx $inputCommand
    sbz %z $501h
    jmp $execute
    jmp $start

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