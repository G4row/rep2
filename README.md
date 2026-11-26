# WSK · Replenishment Board — demo

Demo verzija aplikacije za picking ⇄ replenishment taskove, u istom Matrix dizajnu kao g4row.github.io/wsk.
Samo za pokazivanje: **nema baze i nema automatskog restarta** (04:00 / 15:45).

## Objava na GitHub Pages

1. Učitaj sve iz ove mape u repozitorij, npr. novi repo `replenish` (ili podmapu `replenish/` u repou `wsk`).
2. **Settings → Pages → Deploy from a branch → `main` / `(root)`**.
3. Stranica je na `https://g4row.github.io/replenish/` (ili `https://g4row.github.io/wsk/replenish/`).

Na računalu: `python3 -m http.server 8000` u ovoj mapi, pa otvori http://localhost:8000.

## Kako pokazati

- **Početni zaslon:** odaberi jezik (NL, EN, PT, PL, HR), upiši korisničko ime i poziciju.
- **Dvije uloge odjednom:** prijava vrijedi za jedan tab. U jednom tabu budi picker, u drugom replenisher (isti preglednik). Promjene se u drugom tabu pojave odmah.
- **Picking:** *Novi task* → Barkod ili Upiši → lokacija se pojavi u *Zahtjevi* sa statusom Čeka.
- **Replenishment:** *Novi task* → popis lokacija koje čekaju → *Prihvati* → u *Moji taskovi* gumb *Gotovo*.
- **Napomena:** obje uloge; lokacija s napomenom ima oznaku NAPOMENA u tablici.
- **Uloga ▾** (gore desno): promjena pozicije i jezika bez ponovne prijave.
- **Analitika:** Undo (Reset), Lokacije, Target, Tim, Ispis (Excel za odabrani datum).
- **SERVER: ON/OFF** (gore u sredini): u demu se klikom simulira gašenje servera, pa se vidi kako aplikacija tada blokira promjene.
- **resetiraj demo** (dno stranice): vraća sve na početno stanje.

## Obavijesti

Kad picker posta lokaciju, **svi prijavljeni u istom pregledniku** dobiju obavijest, i picker koji ju je postao:
- skočni prozor gore desno (replenisher ima gumb *Prihvati*, picker *Prikaži*)
- zvuk (kratki trostruki „bip")
- vibraciju (Android; iPhone ne podržava vibraciju iz preglednika)
- broj novih lokacija u naslovu taba, npr. „(2) WSK · Replenishment Board", dok je tab u pozadini
- obavijest sustava kad je tab u pozadini, ako se uključi u **Uloga ▾ → Obavijesti → Obavijesti sustava** (preglednik jednom pita za dopuštenje)

U istom izborniku zvuk i vibracija se mogu isključiti, a **Testiraj obavijest** prikaže probnu obavijest.

Preglednici puštaju zvuk tek nakon prvog dodira ili klika na stranicu. Zato u svakom tabu jednom klikni bilo gdje (prijava je dovoljna) ili pritisni **Testiraj obavijest**.

Demo nema server, pa obavijest **ne stiže na drugi uređaj**. Za pokazivanje koristi dva taba ili prozora na istom uređaju. U pravoj verziji server bi slao obavijesti svim uređajima (dok je aplikacija otvorena), a push obavijesti i kad je mobitel zaključan.

## Što je unaprijed upisano

- 12 lokacija na ploči: D53-004-41, D53-033-25, D13-007-11, D17-010-11, D12-007-23, D15-007-23, D15-038-15, D11-032-11, D10-006-25, D18-000-24, D15-016-23, D13-010-19 (10 čeka, 2 u tijeku).
- Oko 6 sati izmišljene povijesti (44 gotova taska na istim lokacijama, 2 napomene, 2 resetiranja), da Analitika ima što pokazati.
- Prvi replenisher ili analitičar koji se prijavi „preuzme" 11 tih gotovih taskova kao svoje, pa odmah vidi Target i Undo.

## Pravila koja sam postavio

- *Gotovo* stavlja replenisher koji je prihvatio task (u *Moji taskovi*).
- *Reset* radi na taskovima U tijeku i Gotovo; vrijeme od postanja ostaje u ukupnom.
- Ista lokacija ne može dvaput biti aktivna (Čeka / U tijeku).
- Lokacija mora počinjati s D i dvije znamenke (zona), npr. D53-004-41.
- Barkod kamerom radi u Chromeu na Androidu (preko HTTPS-a, npr. GitHub Pages). Ručni skener radi uvijek, jer upisuje kod kao tipkovnica.

## Datoteke

```
index.html            stranica
css/style.css         Matrix tema (iste boje i fontovi kao wsk)
js/app.js             logika aplikacije
js/i18n.js            prijevodi (nl, en, pt, pl, hr)
js/store.js           podaci (localStorage) i početni demo podaci
js/rain.js            Matrix kiša na prijavi
js/xlsx.full.min.js   SheetJS za Excel (isti kao u wsk)
sw.js                 service worker samo za obavijesti sustava
```

## Za pravu verziju

Zamijeniti `js/store.js` pozivima prema API-ju na laptopu (SQL Server), dodati automatski restart u 04:00 i 15:45 i stvarnu provjeru SERVER ON/OFF. Ostatak aplikacije može ostati isti.
