    local 0e000h

    def ret (50h 00h)
    def lnk (50h 01h)
    def msp (51h (r r))

    def psh (52h (0 r))
    def pop (52h (1 r))

    rom_start   equ 800h
    stack       equ 3f0h
    crtrg_sts   equ 0d090h

start:
    chb $stack.h    ; configurar pagina del stack
    chc $stack.l    ; configurar offset del stack
    msp %b %c       ; poner el stack
    
    psh %a
    pop %a

.loop:
    lds $crtrg_sts  ; revisar cartucho
    twi $0ffh       ; nah.
    ldc $1          ; verificar si es igual
    jic $.loop      ; si si, seguir esperando
    stc             ; activar flag de comp
    jic $rom_start  ; saltar al cartucho

gisr:
    psh %a

    pop %a
    ret

    rsv (1ffAh-$)
    word 0 ; reserved
    word (start) ; reset vector
    word (gisr) ; interrupt globl

    rsv (2000h-$)