Hva er dette egentlig?
Tenk deg at du jobber i juridisk avdeling i et stort statlig investeringsfond (tenk: Oljefondet, men fiktivt). Fondet eier 100 datterselskaper spredt over 18 land — alt fra solparker i Brasil til hoteller i Dublin.

Problemet er at all styringsinformasjon lever i Excel-ark og e-poster. Ingen skikkelig oversikt. Og om noen dager er det styremøte.

Din jobb: bygg et verktøy som gir den lille juridiske teamet oversikt over kaos.

Hva er CSV-fila? (subsidiaries.csv)
Dette er selskapsregisteret — én rad per datterselskap. Her er hva hver kolonne betyr:

Kolonne	Hva det er	Eksempel
entity_id	Unik ID for selskapet	FGI-001
entity_name	Navn på selskapet	FGI Europe Holdings B.V.
entity_type	Selskapsform (tilsvarer AS, LLC osv)	B.V. = nederlandsk AS
jurisdiction	Landet selskapet er registrert i	Netherlands
incorporation_date	Stiftelsesdato	2015-06-02
parent_entity_id	Hvem eier dette selskapet? (peker på en annen rad)	FGI-001
ownership_pct	Hvor stor eierandel har morselskapet	100.0 eller 60.0 (JV)
registered_address	Offisiell forretningsadresse	Laralaan 32, Rotterdam
board_members	Hvem sitter i styret	Tricia Valencia, Noah Rhodes
board_mandate_expiry	Når løper styrets mandat ut	2026-06-03 ← viktig!
annual_filing_due	Frist for å levere årsregnskap til myndighetene	2027-01-23
annual_filing_status	Er det levert?	Filed / Pending / Overdue
registered_agent	Det lokale advokatfirmaet/agenten som hjelper dem	Goyaerts van Waderle B.V.
status	Er selskapet aktivt?	Active / Dissolved / In liquidation
asset_class	Hva slags investering er dette	Real Estate / Renewable Energy / Holding
asset_description	Konkret hva de eier	400MW onshore wind farm
Strukturen er et tre: FGI-001 (Norsk toppselskap) eier FGI-002 (Europeisk holdingselskap), som igjen eier 50+ datterselskaper i Europa. Separate grener for Amerika og Asia-Pacific.

Hva er JSON-fila? (board_updates.json)
Dette simulerer innboksen til juristene — e-poster, telefonnotater og skannede brev fra lokale agenter rundt om i verden som melder fra om endringer i styrene.

Typiske meldinger:

"Tricia Valencia har trukket seg fra styret i FGI Copenhagen Retail"
"Styremandatet er fornyet — nytt utløp 2027-05-28"
"Adressen er endret"
Problemet: Disse meldingene er rotete. Datoene er i tre forskjellige formater (15 May 2026, 2026-05-31, 05/25/2026). Selskapsnavn matcher ikke alltid CSV-en. Og noen meldinger refererer til selskaper som ikke finnes i registeret i det hele tatt — ghost entities.

Hva er PDF-filene?
Tre formelle brev fra lokale forvaltningsagenter (firmaer fondet betaler for å håndtere lokale juridiske krav):

Fil	Hvem	Hva de sier
luxembourg_mandate_warning.pdf	Lux Corporate Management	"Disse 3 Luxembourg-selskapene har styremandat som løper ut innen 60 dager"
singapore_compliance_update.pdf	Pacific Corporate Advisory	"FGI Singapore Solar III er markert som oppløst hos dere, men vi har fortsatt åpne compliance-saker"
netherlands_filing_reminder.pdf	Van der Berg Corporate Services	"2 nederlandske selskaper har forfalt årsregnskap"
Twisten: Disse brevene nevner selskaper og detaljer som ikke stemmer med CSV-en — enten fordi registeret er utdatert, eller fordi noen har rotet det til.

Hva er selve problemstillingen?
Det er tre praktiske juridiske risikoer en slik avdeling alltid jakter på:

1. Forfalt årsregnskap
Hvert land krever at selskaper leverer årsregnskap. Gjør du ikke det → bøter, i verste fall tvangsmessig avvikling. 14 selskaper i registeret er allerede Overdue.

2. Utløpende styremandat
Styremedlemmer har et mandat med utløpsdato. Løper det ut uten fornyelse → selskapet har teknisk sett et ugyldig styre → kan ikke fatte vedtak lovlig. Noen mandater løper ut om dager.

3. Datakvalitetsproblemer
Registeret er ikke til å stole på blindt:

Sirkulær eierskap (to selskaper eier hverandre)
Et selskap registrert i et ikke-eksisterende land ("Noveria" — fra et videospill)
Et selskap stiftet i 2027 (fremtiden)
Selskaper som er oppløst men fortsatt har åpne forpliktelser
Hva skal appen gjøre?
Data (CSV + JSON + PDFs)
        ↓
  FastAPI backend
  - Renser og normaliserer data
  - Matcher board-updates til riktig selskap
  - Oppdager risikoer automatisk
  - Spør LLM: "Hva bør teamet gjøre med dette?"
        ↓
  React frontend
  - Dashboard med risikoer rangert etter alvor
  - Tabell med alle selskaper (filtrerbart)
  - AI-genererte anbefalinger per selskap
LLM-rollen er: ta all rotete input (brev, JSON-meldinger, CSV-data) → gi strukturert output på naturlig språk: "FGI Treasury & Financing: Styremandatet løper ut 19. juni. Konflikt mellom brevet og registeret — avklar umiddelbart."

Kort sagt: det er et governance-verktøy for et juridisk team som drukner i manuelt arbeid. Du bygger det som skal redde dem fra å misse kritiske frister.

Klar til å starte på selve koden?