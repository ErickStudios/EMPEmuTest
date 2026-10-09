
    ; *****************************
    ;   PROCYON START FIRMWARE
    ;
    ; the std rom that is loaded on
    ; start the console
    ; *****************************

    local 0f00h

    jmp $lba_read ; 0f00h

    ; X = SECTOR, Y = BUFFER
lba_read:
    stx %z $401h ; ready sector
    sub %a %a ; set a to 0
.loop:
    ldx %z $403h ; load word of card0
    stx %y $0 ; store to buffer
    chx $2 ; increment
    add %y %x ; increment buffer ptr
    add %a %x ; increment counter

    sbx %z $405h ; for next step
    tia $512 ; verify if not pass 512
    lcf $2 ; less
    bcf $.loop ; if not repeat
    sbz %z $500h ; return

start:
.check:
    lba %z $400h ; check if card0 present
    tia $0ffh ; not present value
    lcf $1 ; if is equal
    bcf $.nocard0 ; check again
    
    sbz %z $440h ; keyboard compatibility mode

    sub %x %x ; sector 0
    chy $700h ; buffer at ram start
    sbz %z $501h ; link at next flag
    jmp $lba_read ; load sector
    chx $1 ; sector 1, buffer preserved
    sbz %z $501h ; link at next flag
    jmp $lba_read ; read sector

    jmp $700h ; jump to 700

.nocard0:
    chx $0ffffh ; new mem limit
    stx %z $470h ; set mem limit
    jmp $1000h ; jump to ROM2 (built-in basic)

    rsv (0fch-$)
    jmp $start
    rsv (100h-$)