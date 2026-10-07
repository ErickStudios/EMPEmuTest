    local 0f00h

    stnm_s1 equ 0h
    stnm_s2 equ 2h
    
    jmp $lba_read ; 0f00h

;lta:
    ;byte 1, 0, 16
    ;byte 0, 1, 9, 9, 8, 8, 0, 8, 8, 9, 0, 0, 0, 0, 9, 0


    ; X = SECTOR, Y = BUFFER
lba_read:
    stx %z $401h
    sub %a %a
.loop:
    ldx %z $403h
    stx %y $0
    chx $2
    add %y %x
    add %a %x
    sbx %z $405h

    tia $512
    lcf $2
    bcf $.loop
    sbz %z $500h

start:
.check:
    ;chy $lta
    ;sty %z $600h

    lba %z $400h  ; el estado de el almacenamiento interno
    tia $0ffh       ; si esta ausente
    lcf $1          ; cargar
    bcf $.check     ; esta ausente
    
    sub %x %x
    chy $700h
    sbz %z $501h ; link at next flag
    jmp $lba_read
    chx $1
    chy $900h
    sbz %z $501h ; link at next flag
    jmp $lba_read

    jmp $700h

    rsv (0fch-$)
    jmp $start
    rsv (100h-$)