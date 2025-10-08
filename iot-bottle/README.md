# IoT Bottle an ITS Academy Angelo Rizzoli challenge

Un contest lampo dove il tuo smartphone diventa… una borraccia smart!
L’app usa l'accelerometro: a intervalli casuali sceglie un giocatore, vibra e sul display appare la sfida.
Hai 3 secondi per “bere” inclinandolo e scuotendolo come una vera borraccia.
Ogni sorso conta: più bevi dalla borraccia riutilizzabile, più CO₂ eviti rispetto all’acqua in bottiglia monouso.
Classifiche live, colpi di scena e… sete di sostenibilità!

Livelli & CO₂ risparmiata (per partita):
- Kid: fino a 0,25 kg CO₂ evitata
- Rookie: da 0,26 a 1,00 kg CO₂ evitata
- Hero: oltre 1,00 kg CO₂ evitata

Pronti? Telefono in mano, borraccia virtuale alzata… e che vinca chi risparmia più CO₂!

## The Challenge

La sfida si articola così:
1. ogni partecipante installa Expo Go 
2. ogni partecipante scansionando il QR code di un Expo Snack avvia l'app
3. l'app è un simulatore di borraccia, contiene acqua, quando la inclini l'acqua esce dal beccuccio
4. tramite la dashboard web si avvia la sfida che va in crescendo di 4 minuti in 4 minuti
5. 0-4 minuti: 4-5 telefoni vibrano, i partecipanti selezionati deve simulare il gesto di bere dalla borraccia
6. 4-8 minuti: 10-15 telefoni vibrano, i partecipanti selezionati deve simulare il gesto di bere dalla borraccia
7. 8-12 minuti: 15-30 telefoni vibrano, i partecipanti selezionati deve simulare il gesto di bere dalla borraccia
8. in base a quanti partecipanti attivamente svolgono correttamente il gesto di bevuta dalla borraccia vengono calcolati i valori CO2 risparmiati rispetto ad aver comprato delle bottigliette d'acqua
9. una somma finale della CO2 mostrata a schermo consente al tutor di scegliere la parola chiave corretta associata ad ogni punteggio

## Tech spech

La struttura del progetto è suddivisa in due cartelle frontend e backend.

### frontend

E' un applicazione Expo / React Native pubblicata su Expo Snacks così da poter installarla senza passare dallo store in quando si può utilizzare l'applicazione Expo Go.

L'applicazione Expo è composta da unico file frontend/App.js

#### DONE
- calcolo del fingerprint del device 
- assegnazione casuale di team in base al fingerprint
- funzioni axios per svolgere richieste HTTP al backend
- listener per ottenere gli eventi prodotti dall'accelerometro
- React state per visualizzare dati grezzi dall'accelerometro
- mostra sullo sfondo la sagoma di una borraccia
- la sagoma della borraccia contiene acqua
- l'acqua si anima in base all'inclinazione del telefono
- se il telefono è verticale l'acqua rimane all'interno della borraccia ferma
- se il telefono è inclinato l'acqua si inclina ed eventualmente fuoriesce dal beccuccio della borraccia
- l'acqua fuoriesce dal beccuccio solo se parzialmente inclinata permettendo all'aria di entrare
- non vi è alcuna animazione dell'acqua che fuoriesce dal beccuccio della borraccia

#### TODO
- aggiun
