
    local 0
    
bs:
    jmp $(.start+700h)
    rsv ((4-($%4))%4)
    byte    'mkcard     '   ; oem label
    word    (ends / 512)    ; total sectors
    word    (root / 512)    ; super block ubication
    word    ((root.eof-root) / 20) ; root entrys
.start:
    lda %z $(bs+704h+11)
    add $'0'
    sba %z $340h

.sat:
    jmp $(.sat+700h)

    rsv ((1024-($%1024))%1024)
root:
    byte    'test    txt'
    word    (cnt0 / 512)
    byte    06,10   ; day and month
    word    2026    ;
    word    (cnt0.eof-cnt0)
.eof:

    rsv ((512-($%512))%512)
cnt0:
    byte    'hello world'
.eof:

    rsv ((512-($%512))%512)
ends: