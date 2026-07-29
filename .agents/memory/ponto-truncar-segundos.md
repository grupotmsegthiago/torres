# Ponto: jornada só em HH:MM (sem segundos)

- Batidas do Control iD vêm com segundos; a tela mostra só HH:MM.
- Planilha manual / cartão usam o HH:MM → sistema **não** pode somar `(out−in)` em ms.
- Usar `truncateToMinuteMs` / `workedMinutesBetween` em `buildFolhaPonto` (e noturno).
- Ex.: 08:00:47→18:00:22 conta 10:00, não 9:59:35 arredondado.
