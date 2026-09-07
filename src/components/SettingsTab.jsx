import { useEffect, useRef, useState } from 'react'
import {
  subscribeSettings,
  updateSettings,
  replaceCatalog,
  resetOpenOrdersToReceived,
} from '../lib/api.js'
import { CANCEL_PHRASES } from '../lib/orderStatus.js'
import {
  MODI_CONSEGNA,
  clienteSceglie,
  fraseAnnulloDefault,
  fraseAnnulloPossibile,
  modoAllaNascita,
  mondoConsegna,
} from '../lib/consegna.js'
import { parseCarteCsv, decodeCsvBuffer } from '../lib/carteImport.js'
import ConfirmDialog from './ConfirmDialog.jsx'
import ThemeSettings, { TemaMenuClienti } from './ThemeSettings.jsx'
import PrinterSetup from './PrinterSetup.jsx'
import StampaAutomatica from './StampaAutomatica.jsx'
import ToggleRow from './ToggleRow.jsx'
import {
  MOTIVO_PREMIUM,
  chiaveModulo,
  moduliPremium,
  moduloAttivo,
  moduloIncluso,
} from '../lib/licenza.js'
import CampiStampa, { LogoStampe } from './CampiStampa.jsx'

import BackupPanel from './BackupPanel.jsx'
import InfoTab from './InfoTab.jsx'
import { pairSumUpReader, unpairSumUpReader } from '../lib/paymentsApi.js'
import { Link } from 'react-router-dom'
import { devToolsEnabled } from '../dev/devActions.js'
import { Sottosezioni } from '../lib/sottosezioni.js'
import { MODI_STRISCIA, MODO_STRISCIA_DEFAULT } from '../lib/strisce.js'
import { usePaginaPiena } from '../lib/paginaPiena.js'

// Impostazioni del bar (documento settings/bar). Ogni modifica viene salvata
// subito; le pagine cliente le ricevono in tempo reale via subscribeSettings.
export default function SettingsTab({ role = null }) {
  // La schermata sta tutta nella finestra: scorre la sezione aperta, non la
  // pagina con dentro la testata.
  usePaginaPiena()
  const [settings, setSettings] = useState(null)
  const [error, setError] = useState(null)
  const [confermaSpegni, setConfermaSpegni] = useState(false) // gestione preparazione
  const [esitoReset, setEsitoReset] = useState(null)
  // Sezione aperta: si ricorda, perché a impostazioni si torna sempre per
  // lo stesso motivo (di solito gli orari o i pagamenti).
  // …ma un collegamento può chiedere una sezione precisa (?sezione=…): ci
  // arriva la notifica «l'app è cambiata», che deve aprire le Informazioni e
  // non l'ultima sezione guardata.
  const [sezione, setSezione] = useState(() => {
    try {
      const chiesta = new URLSearchParams(window.location.search).get('sezione')
      if (chiesta) return chiesta
      return localStorage.getItem('tana:impostazioni:sezione') || 'aspetto'
    } catch {
      return 'aspetto'
    }
  })
  const scegliSezione = (id) => {
    setSezione(id)
    try {
      localStorage.setItem('tana:impostazioni:sezione', id)
    } catch {
      /* niente memoria: vale per questa volta */
    }
  }

  useEffect(() => {
    return subscribeSettings(
      (s) => setSettings(s),
      (e) => setError(e.message)
    )
  }, [])

  async function save(patch) {
    setError(null)
    // Aggiornamento ottimistico: il listener riallinea comunque dal server.
    setSettings((s) => ({ ...s, ...patch }))
    try {
      await updateSettings(patch)
    } catch (e) {
      setError(e.message)
    }
  }

  if (!settings) return <div className="empty">Carico le impostazioni…</div>

  // OGNI RIQUADRO UNA SCHEDA. Erano venti riquadri uno sotto l'altro in una
  // pagina lunghissima: per cambiare l'orario di chiusura si scorreva
  // oltre pagamenti, gruppi, sconti e coperto, e quello che si cercava lo
  // si trovava a occhio. Con la barra a sinistra (la stessa di Inventario
  // e Menù) si va dritti dove serve, e la scelta resta per la volta dopo.
  const sezioni = [
    { id: 'aspetto', icona: '🎨', label: 'Aspetto', nodo: <ThemeSettings settings={settings} onSave={save} /> },
    {
      id: 'vista-ordine',
      icona: '🧾',
      label: 'Vista ordine',
      nodo: (
            <div className="card settings-section">
              <h3>Vista ordine (bartender)</h3>
              <p className="muted" style={{ margin: '0 0 10px', fontSize: '0.85rem' }}>
                Toccando un prodotto nella griglia si aggiunge sempre una <strong>riga
                nuova</strong> (così si può personalizzarla e annotarla); per
                aumentare la quantità si usa il <strong>+ sulla riga</strong> del
                conto. Dal riepilogo si possono comunque unire o separare al volo.
              </p>

              <p className="muted" style={{ margin: '12px 0 6px', fontSize: '0.85rem' }}>
                Dove finisce l’item appena aggiunto nella lista del conto.
              </p>
              <SceltaModo
                valore={!!settings.pos_add_top}
                opzioni={[
                  [false, '⬇ In fondo (scorre)'],
                  [true, '⬆ In cima'],
                ]}
                onScegli={(v) => save({ pos_add_top: v })}
              />

              {/* LA ⓘ DELLE RICETTE. Dove il listino lo sanno tutti a memoria
                  è un segno in più su ogni card, e le card sono cento. Dove
                  invece cambia spesso, o si dà una mano il sabato, è la
                  differenza fra saper fare un drink e doverlo chiedere. */}
              <ToggleRow
                label="La ⓘ con la ricetta sulle card"
                desc="Apre ingredienti, quantità e come si prepara. Spenta, le card restano pulite."
                checked={settings.pos_ricetta_info !== false}
                onChange={(v) => save({ pos_ricetta_info: v })}
              />

              <p className="muted" style={{ margin: '12px 0 6px', fontSize: '0.85rem' }}>
                Quanto è grande, come minimo, il testo delle righe del conto.
                Il testo segue la larghezza del pannello, ma sotto questa
                soglia non scende.
              </p>
              <SceltaModo
                colonne="1fr 1fr 1fr 1fr"
                valore={Number(settings.pos_testo_min) || 1.1}
                opzioni={[
                  [0.85, 'Piccolo'],
                  [1, 'Medio'],
                  [1.1, 'Grande'],
                  [1.25, 'Extra'],
                ]}
                onScegli={(v) => save({ pos_testo_min: v })}
              />

              <p className="muted" style={{ margin: '12px 0 6px', fontSize: '0.85rem' }}>
                Come mostrare le categorie nel POS. L’icona e il colore di ogni
                categoria si impostano nel <strong>Menù → Categorie</strong>: se una
                categoria non ha un’icona, al suo posto compare il pallino colore.
              </p>
              <SceltaModo
                colonne="1fr 1fr 1fr"
                valore={settings.category_display || 'dot'}
                opzioni={[
                  ['dot', '● Pallino + nome'],
                  ['icon_text', '🍸 Icona + nome'],
                  ['icon', '🍸 Solo icona (senza nome)'],
                ]}
                onScegli={(v) => save({ category_display: v })}
              />

              <h4>La ricerca nella griglia dei prodotti</h4>
              <p className="muted" style={{ margin: '0 0 10px', fontSize: '0.85rem' }}>
                Cercando un prodotto nella griglia: si può <strong>filtrare</strong>,
                lasciando le sole card che rispondono, oppure lasciare la griglia
                com&apos;è e <strong>accendere</strong> la prima card trovata,
                portandocisi sopra. Il secondo modo serve a chi la griglia la conosce
                a memoria e non vuole vederla cambiare sotto le dita; mostra tutti i
                prodotti mentre si cerca, perché quello giusto può stare in
                un&apos;altra categoria. Toccando una card la ricerca si azzera da sé.
              </p>
              <SceltaModo
                valore={settings.pos_search || 'filtra'}
                opzioni={[
                  ['filtra', '🔍 Filtra la griglia'],
                  ['evidenzia', '💡 Accendi il prodotto e portami lì'],
                ]}
                onScegli={(v) => save({ pos_search: v })}
              />

              {/* LA STRISCIA A SINISTRA DELLE CARD. È lo stesso segno in due
                  schermate e finora diceva una cosa decisa da noi: dipende
                  invece da come si lavora. */}
              {/* SOLO LA DOMANDA. Il perché — chi conosce il listino a
                  memoria vuole i colori, chi sta finendo le bottiglie
                  vuole vedere cosa non si può più fare — sta nel requisito
                  e in lib/strisce.js. E dove sta l'altra impostazione lo
                  si scopre andandoci: scriverlo qui è una nota per noi,
                  non per chi sceglie. */}
              <h4>
                Cosa dice la riga a sinistra di ogni scheda della griglia?
              </h4>
              <SceltaModo
                colonne="1fr 1fr"
                valore={settings.stripe_pos || MODO_STRISCIA_DEFAULT}
                opzioni={MODI_STRISCIA.map((m) => [m.id, m.label, m.desc])}
                onScegli={(v) => save({ stripe_pos: v })}
              />

              <p className="muted small" style={{ margin: '12px 0 4px' }}>
                Quale colore per «ci sono abbastanza scorte»?
              </p>
              <SceltaModo
                valore={!!settings.stripe_ok_verde}
                opzioni={[
                  [false, '⚪ Grigio'],
                  [true, '🟢 Verde'],
                ]}
                onScegli={(v) => save({ stripe_ok_verde: v })}
              />
            </div>
      ),
    },
    {
      id: 'consegna',
      icona: '🛎',
      label: 'Consegna ordine',
      nodo: (
            <div className="card settings-section">
              <h3>Consegna ordine</h3>
              <p className="muted" style={{ margin: '0 0 10px', fontSize: '0.85rem' }}>
                Come lavora il locale. NON è un vincolo: qualunque cosa si
                scelga qui, il banco e la sala possono sempre mettere
                servizio o ritiro sul singolo conto, da «Dati conto». Qui si
                decide come NASCONO i conti.
              </p>
              <SceltaModo
                valore={mondoConsegna(settings)}
                opzioni={[
                  ['tavolo', '🍸 Solo servizio', 'Si porta tutto al tavolo.'],
                  [
                    'entrambi',
                    '🤝 Ritiro e servizio',
                    'Chi si siede si fa servire, chi ha fretta ritira al banco.',
                  ],
                ]}
                onScegli={(v) => save({ service_mode: v })}
              />

              {/* DENTRO IL SECONDO MONDO, e solo lì: col solo servizio non
                  c'è niente da scegliere e niente da far scegliere. */}
              {mondoConsegna(settings) === 'entrambi' && (
                <>
                  <h4>Come nascono i conti</h4>
                  <p className="muted" style={{ margin: '0 0 10px', fontSize: '0.85rem' }}>
                    Il valore di partenza di un conto battuto al banco o in
                    sala. Si cambia conto per conto in un tocco: il ritiro
                    azzera coperto e costo di servizio.
                  </p>
                  <SceltaModo
                    valore={modoAllaNascita(settings)}
                    opzioni={MODI_CONSEGNA}
                    onScegli={(v) => save({ consegna_default: v })}
                  />

                  {/* CHI SCEGLIE, non cosa si sceglie: senza ordinazioni dei
                      clienti non c'è nessuno a cui chiederlo, e la voce si
                      spegne dicendo perché invece di restare lì a mentire. */}
                  <ToggleRow
                    label="Lo sceglie il cliente"
                    desc={
                      settings.menu_only ? (
                        <>
                          Adesso non si può: i clienti vedono il menù ma non
                          ordinano, e senza ordinazioni non c’è nessuno a cui
                          chiederlo.{' '}
                          <button
                            type="button"
                            className="link-inline"
                            onClick={() => scegliSezione('menu-clienti')}
                          >
                            Vai a Menù clienti
                          </button>
                        </>
                      ) : (
                        'Ordinando dal telefono il cliente sceglie se farsi servire al tavolo o ritirare al banco. Spenta: decide il locale, e lo staff può cambiarlo sul conto.'
                      )
                    }
                    checked={clienteSceglie(settings)}
                    disabled={settings.menu_only === true}
                    onChange={(v) => save({ cliente_sceglie_consegna: v })}
                  />
                </>
              )}
            </div>
      ),
    },
    {
      id: 'pagamenti',
      icona: '💳',
      label: 'Pagamenti',
      nodo: (
            <div className="card settings-section">
              <h3>Pagamenti</h3>
              {/* STA QUI E NON IN «GESTIONE PREPARAZIONE»: parla di come si
                  incassa, e chi lo cerca apre Pagamenti — c'era finito
                  accanto a «Riscuoti e servi» per parentela di forma, e
                  l'utente non lo trovava. */}
              <ToggleRow
                label="Un tasto per incassare senza stampare"
                desc="Nella schermata di pagamento compare anche «Riscuoti (senza stampa)»: incassa e chiude senza far uscire lo scontrino, per chi non lo vuole."
                checked={settings.riscuoti_senza_stampa === true}
                onChange={(v) => save({ riscuoti_senza_stampa: v })}
              />
              {/* E ADESSO ANCHE IL SUO GEMELLO, PER LO STESSO IDENTICO
                  MOTIVO. Stava in «Gestione preparazione» e l'utente non
                  l'ha trovato (21/08/2026) — già successo il 20/08 con
                  quello qui sopra. I due tasti compaiono nella stessa
                  schermata, uno accanto all'altro: si accendono nello
                  stesso posto.
                  LA CONDIZIONE SE L'È PORTATA DIETRO: «servire» esiste solo
                  se si seguono i passi del servizio. Col servizio spento
                  il tasto non comparirebbe comunque, e un interruttore che
                  non fa niente è peggio di uno assente. */}
              {settings.workflow_enabled !== false && (
                <ToggleRow
                  label="Un tasto per incassare e servire insieme"
                  desc="Nella schermata di pagamento compare anche «Riscuoti e servi»: chiude il conto in un colpo, per quando si consegna e si incassa nello stesso gesto."
                  checked={settings.riscuoti_e_servi === true}
                  onChange={(v) => save({ riscuoti_e_servi: v })}
                />
              )}
              {/* LO SCONTRINO D'ACCONTO NON È PIÙ QUI: «esce da sola a ogni
                  riscossione» è stampa automatica, e sta nel riquadro qui
                  sotto insieme a tutte le altre (REQ-UI-025). Resta nella
                  stessa sezione, a uno scorrimento di distanza, quindi la
                  lezione di BUG-070 — gli interruttori dei tasti
                  dell'incasso si accendono dove si incassa — regge. */}
              <ToggleRow
                label="Pagamento online (SumUp)"
                desc="Il cliente può pagare con carta dal suo telefono al momento dell'ordine."
                checked={settings.payments_online_enabled}
                onChange={(v) => save({ payments_online_enabled: v })}
              />
              {settings.payments_online_enabled && (
                <>
                  <ToggleRow
                    label="Pagamento obbligatorio"
                    desc="L'ordine entra in coda solo dopo il pagamento online."
                    checked={settings.payments_online_required}
                    onChange={(v) => save({ payments_online_required: v })}
                  />
                  {!settings.payments_online_required && (
                    <ToggleRow
                      label="Senza pagamento, ritiro al banco"
                      desc={
                        settings.service_mode === 'tavolo'
                          ? 'Con servizio solo al tavolo non si applica: chi non paga online paga allo staff alla consegna.'
                          : 'Chi sceglie di pagare al bancone deve ritirare al banco (niente servizio al tavolo).'
                      }
                      checked={settings.banco_required_if_unpaid}
                      onChange={(v) => save({ banco_required_if_unpaid: v })}
                    />
                  )}
                </>
              )}
              <ToggleRow
                label="Lettore SumUp Solo"
                desc="Incasso col lettore di carte direttamente dalla coda ordini (Cloud API, lettore in Wi-Fi)."
                checked={settings.payments_reader_enabled}
                onChange={(v) => save({ payments_reader_enabled: v })}
              />
              {settings.payments_reader_enabled && <ReaderPairing settings={settings} />}
            </div>
      ),
    },
    {
      id: 'stampa-automatica',
      icona: '🖨️',
      label: 'Stampa automatica',
      nodo: <StampaAutomatica settings={settings} save={save} />,
    },
    {
      id: 'gruppi',
      icona: '👥',
      label: 'Gruppi di ordini',
      nodo: (
            <div className="card settings-section">
              <h3>Gruppi di ordini</h3>
              <p className="muted small" style={{ margin: '0 0 8px' }}>
                Servono quando <strong>più conti separati devono pagare insieme</strong>:
                una tavolata in cui ognuno ha il suo conto, o un evento con più
                tavoli che si saldano in blocco. Se da voi un tavolo = un conto
                NON servono: la schermata di pagamento sa già dividere un conto
                per articoli o incassare acconti.
              </p>
              <ToggleRow
                label="Abilita i gruppi"
                desc="Se spenti, spariscono ovunque e nulla cambia nel resto del lavoro."
                checked={settings.groups_enabled}
                onChange={(v) => save({ groups_enabled: v })}
              />
              {settings.groups_enabled && (
                <>
                  <div className="muted small" style={{ margin: '8px 0' }}>
                    <strong>Come funzionano</strong>
                    <ol style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                      <li>Crei il gruppo dal pannello nella coda o dal menu laterale.</li>
                      <li>
                        Toccandolo vedi <strong>gli ordini di quel gruppo</strong>, il totale
                        e quanto resta da pagare.
                      </li>
                      <li>
                        Da lì aggiungi un ordine col tasto ✍️: si apre il POS e l’ordine
                        nasce già dentro il gruppo.
                      </li>
                      <li>
                        Alla fine incassi tutto insieme, oppure dividi in quote uguali.
                      </li>
                    </ol>
                    Gli ordini di un gruppo restano <strong>visibili nella coda</strong> come
                    tutti gli altri, con l’etichetta 👥 del gruppo.
                    Un gruppo può contenere altri gruppi (es. “Compleanno” con
                    “Tavolo A” e “Tavolo B”): chi contiene sottogruppi non ha ordini
                    diretti, si ordina nei figli.
                  </div>
                  <ToggleRow
                    label="Mostra nel menu laterale"
                    desc="Quadratini dei gruppi nel drawer: toccarne uno apre i suoi ordini."
                    checked={settings.groups_in_drawer}
                    onChange={(v) => save({ groups_in_drawer: v })}
                  />
                  <ToggleRow
                    label="Pannello gruppi nella coda"
                    desc="Pannello a scomparsa nella coda ordini con i gruppi e i loro conti."
                    checked={settings.groups_in_queue}
                    onChange={(v) => save({ groups_in_queue: v })}
                  />
                </>
              )}
            </div>
      ),
    },
    {
      id: 'preparazione',
      icona: '🍸',
      label: 'Gestione preparazione',
      nodo: (
            <div className="card settings-section">
              <h3>Gestione preparazione</h3>
              <p className="muted small" style={{ margin: '0 0 8px' }}>
                Serve se al bancone seguite la lavorazione dei drink: ricevuto →
                in preparazione → pronto → servito. Se il locale lavora “a vista”
                (si prepara e si consegna subito) è solo lavoro in più.
              </p>
              <ToggleRow
                label="Segui la preparazione degli ordini"
                desc="Spenta: si tiene traccia solo degli ordini (ricevuto e pagato). Spariscono avanzamenti di stato, tempi di servizio, stima ai clienti e avvisi di “pronto”."
                checked={settings.workflow_enabled !== false}
                onChange={(v) => (v ? save({ workflow_enabled: true }) : setConfermaSpegni(true))}
              />
              {/* Vale per TUTTE le comande allo stesso modo — la prima di un
                  conto nuovo e le aggiunte a metà serata — perché il passo in
                  cui nasce una comanda si decide in un posto solo
                  (statoComandaNuova in lib/comande.js). */}
              {settings.workflow_enabled !== false && (
                <ToggleRow
                  label="Le comande nascono già in preparazione"
                  desc="Spenta: una comanda nuova sta in «Da fare» finché qualcuno non tocca «Lo preparo io» — che dice anche chi. Accesa: nasce già al banco, per chi versa nell'istante in cui batte e non vuole un tocco in più a ogni comanda."
                  checked={settings.comande_in_preparazione === true}
                  onChange={(v) => save({ comande_in_preparazione: v })}
                />
              )}
              {esitoReset != null && (
                <div className="muted small" style={{ marginTop: 6 }}>
                  ✅ {esitoReset === 0
                    ? 'Nessun conto aperto da riportare indietro.'
                    : `${esitoReset} conti aperti riportati a “ricevuto”.`}
                </div>
              )}
            </div>
      ),
    },
    {
      id: 'giornata',
      icona: '📅',
      label: 'Giornata di lavoro',
      nodo: (
            <div className="card settings-section">
              <h3>Giornata di lavoro</h3>
              <p className="muted small" style={{ margin: '0 0 8px' }}>
                I conti restano aperti finché non li chiudi tu: nessuna “serata”
                da aprire o chiudere. Qui si dice soltanto <strong>a che ora
                finisce una giornata e ne comincia un’altra</strong>. Da
                quell’ora la numerazione degli ordini riparte da 1 e le
                statistiche cominciano a contare il giorno nuovo.
              </p>
              <p className="muted small" style={{ margin: '0 0 8px' }}>
                Con le 5, un ordine battuto all’una di notte è ancora della
                serata prima: la nottata resta tutta insieme, invece di
                spezzarsi a mezzanotte.
              </p>
              <div className="toggle-row">
                <span>Il giorno nuovo comincia alle (ora)</span>
                <AmountInput
                  value={settings.business_day_cutoff_hour}
                  min={0}
                  max={23}
                  step={1}
                  onCommit={(v) => save({ business_day_cutoff_hour: v })}
                />
              </div>
            </div>
      ),
    },
    {
      id: 'prezzo',
      icona: '🏷',
      label: 'Prezzo consigliato',
      nodo: (
            <div className="card settings-section">
              <h3>Prezzo consigliato</h3>
              <p className="muted small" style={{ margin: '0 0 8px' }}>
                Creando un prodotto libero o modificando un drink, il sistema
                calcola il <strong>prezzo reale</strong> sommando il costo al
                dettaglio degli ingredienti (dal listino di magazzino) e propone un{' '}
                <strong>prezzo consigliato</strong> moltiplicandolo per il ricarico.
                È solo un suggerimento: il prezzo resta sempre modificabile.
              </p>
              <div className="toggle-row">
                <span>Ricarico sul costo (×)</span>
                <AmountInput
                  value={settings.price_markup}
                  min={1}
                  max={20}
                  step={0.5}
                  onCommit={(v) => save({ price_markup: v })}
                />
              </div>
              <div className="toggle-row">
                <span>Arrotonda il consigliato a (€)</span>
                <AmountInput
                  value={settings.price_round_step}
                  min={0.05}
                  max={5}
                  step={0.05}
                  onCommit={(v) => save({ price_round_step: v })}
                />
              </div>
              <div className="toggle-row">
                <span>IVA di vendita predefinita (%)</span>
                <AmountInput
                  value={settings.sale_vat}
                  min={0}
                  max={22}
                  step={1}
                  onCommit={(v) => save({ sale_vat: v })}
                />
              </div>
              <p className="muted small" style={{ margin: '4px 0 0' }}>
                IVA di rivendita (somministrazione: <strong>10%</strong>) usata per
                scorporare il fatturato al netto. Vale per tutto il menù, ma ogni
                voce può indicarne una diversa (campo <strong>IVA vendita</strong>
                nella sua scheda): una bottiglia intera non si rivende come un
                drink servito al banco.
              </p>
              <div className="toggle-row">
                <span>IVA di acquisto predefinita (%)</span>
                <AmountInput
                  value={settings.purchase_vat}
                  min={0}
                  max={22}
                  step={1}
                  onCommit={(v) => save({ purchase_vat: v })}
                />
              </div>
              <p className="muted small" style={{ margin: '4px 0 0' }}>
                IVA delle fatture fornitore (ordinaria: <strong>22%</strong>): è il
                valore predefinito dei nuovi prodotti in Magazzino. Ogni prodotto può
                comunque indicarne una diversa (campo IVA).
              </p>
            </div>
      ),
    },
    {
      id: 'tempi',
      icona: '⏱',
      label: 'Tempi di servizio',
      nodo: (
            <div className="card settings-section">
              <h3>Tempi di servizio</h3>
              <ToggleRow
                label="Mostra tempo stimato ai clienti"
                desc="Parte dal tempo base e si raffina con i tempi reali del servizio. Per il ritiro al banco conta solo attesa + preparazione."
                checked={settings.eta_enabled}
                onChange={(v) => save({ eta_enabled: v })}
              />
              {settings.eta_enabled && (
                <div className="toggle-row">
                  <span>Tempo base (minuti)</span>
                  <AmountInput
                    value={settings.eta_base_minutes}
                    min={1}
                    max={120}
                    step={1}
                    onCommit={(v) => save({ eta_base_minutes: v })}
                  />
                </div>
              )}
            </div>
      ),
    },
    {
      id: 'sconto',
      icona: '✂️',
      label: 'Sconto e righe del conto',
      nodo: (
            <div className="card settings-section">
              <h3>Sconto e righe del conto</h3>
              <p className="muted" style={{ margin: '0 0 10px', fontSize: '0.85rem' }}>
                Uno sconto in euro è deciso su un certo conto. Se poi si tolgono o si aggiungono
                righe, quell&apos;importo va riletto: 5&nbsp;€ di sconto su un conto sceso a 3&nbsp;€
                vorrebbero dire incassare −2&nbsp;€. Scegli come deve comportarsi.
                <br />
                Lo sconto in <strong>percentuale</strong> segue sempre il conto, con qualsiasi scelta:
                è la sua definizione.
              </p>
              <div className="sconto-scelte">
                {[
                  [
                    'tetto',
                    '🔒 Tetto al totale',
                    'Lo sconto resta quello che hai scelto finché ci sta dentro. Se togliendo righe il conto scende sotto lo sconto, lo sconto si accorcia fino al totale e il conto diventa offerto: non va mai in negativo. Esempio: conto 20 €, sconto 5 € → togli 8 € di roba → conto 12 €, sconto ancora 5 €, da pagare 7 €. Togli altri 10 € → conto 2 €, lo sconto si accorcia a 2 € e non si paga nulla.',
                  ],
                  [
                    'proporzione',
                    '⚖️ Mantieni la proporzione',
                    'Lo sconto vale sempre la stessa quota del conto: togliendo righe cala insieme al conto, aggiungendone cresce. Esempio: conto 20 €, sconto 5 € (il 25%) → togli 8 € di roba → conto 12 €, sconto 3 €, da pagare 9 €. Da preferire se lo sconto è un "quanto gli faccio di sconto in percentuale" più che una cifra promessa.',
                  ],
                  [
                    'avviso',
                    '⚠️ Avvisa e basta',
                    'L’app non tocca lo sconto che hai messo. Se supera il totale del conto lo segnala in rosso e blocca l’incasso finché non lo correggi a mano. Da scegliere se lo sconto è una cifra concordata col cliente e nessuno, a parte te, deve poterla cambiare.',
                  ],
                ].map(([value, titolo, testo]) => (
                  <button
                    key={value}
                    type="button"
                    className={`sconto-scelta${(settings.discount_policy || 'tetto') === value ? ' active' : ''}`}
                    onClick={() => save({ discount_policy: value })}
                  >
                    <strong>{titolo}</strong>
                    <span className="muted small">{testo}</span>
                  </button>
                ))}
              </div>
            </div>
      ),
    },
    {
      id: 'coperto',
      icona: '🍽',
      label: 'Coperto',
      nodo: (
            <div className="card settings-section">
              <h3>Coperto</h3>
              <ToggleRow
                label="Coperto a persona"
                desc="Il cliente indica quante persone sono al tavolo."
                checked={settings.coperto_enabled}
                onChange={(v) => save({ coperto_enabled: v })}
              />
              {settings.coperto_enabled && (
                <div className="toggle-row">
                  <span>Importo a persona (€)</span>
                  <AmountInput
                    value={settings.coperto_amount}
                    min={0}
                    step={0.5}
                    onCommit={(v) => save({ coperto_amount: v })}
                  />
                </div>
              )}
            </div>
      ),
    },
    {
      id: 'servizio-mancia',
      icona: '🙌',
      label: 'Servizio e mancia',
      nodo: (
            <div className="card settings-section">
              <h3>Servizio e mancia</h3>
              <p className="muted" style={{ margin: '0 0 4px', fontSize: '0.85rem' }}>
                Si può attivare il costo di servizio <em>oppure</em> la mancia, non entrambi.
              </p>
              <ToggleRow
                label="Costo di servizio (%)"
                desc="Percentuale calcolata automaticamente sul totale."
                checked={settings.service_charge_enabled}
                onChange={(v) =>
                  save({ service_charge_enabled: v, ...(v ? { tip_enabled: false } : {}) })
                }
              />
              {settings.service_charge_enabled && (
                <div className="toggle-row">
                  <span>Percentuale (%)</span>
                  <AmountInput
                    value={settings.service_charge_percent}
                    min={0}
                    max={100}
                    step={1}
                    onCommit={(v) => save({ service_charge_percent: v })}
                  />
                </div>
              )}
              <ToggleRow
                label="Mancia libera"
                desc="Il cliente sceglie liberamente un importo al momento dell'ordine."
                checked={settings.tip_enabled}
                onChange={(v) =>
                  save({ tip_enabled: v, ...(v ? { service_charge_enabled: false } : {}) })
                }
              />
            </div>
      ),
    },
    {
      // MENÙ CLIENTI: tutto quello che riguarda la schermata di chi ordina —
      // cosa può fare, cosa vede, di che colore. Stava sparso fra «Modalità
      // menù», «Menù» e «Aspetto», e davanti a un interruttore non si
      // capiva se parlasse del menù dei clienti o della schermata con cui
      // si modifica il listino.
      id: 'menu-clienti',
      icona: '📖',
      label: 'Menù clienti',
      nodo: (
        <div className="card settings-section">
          <h3>Menù clienti</h3>
          <p className="muted small" style={{ margin: '0 0 10px' }}>
            La schermata che vedono i clienti sul telefono.
          </p>
          <ToggleRow
            label="Solo menù (consultazione)"
            desc="I clienti vedono il menù ma non possono ordinare."
            checked={settings.menu_only}
            onChange={(v) => save({ menu_only: v })}
          />
          <ToggleRow
            label="Mostra quantità ingredienti"
            desc="Es. «Gin 50 ml» invece di solo «Gin» nelle voci del menù."
            checked={settings.show_ingredient_quantities}
            onChange={(v) => save({ show_ingredient_quantities: v })}
          />
          <ToggleRow
            label="Tabellone «stiamo servendo»"
            desc="Mostra nel menù i numeri degli ordini pronti al servizio/ritiro. Nascosto in modalità solo menù."
            checked={settings.show_serving_board}
            onChange={(v) => save({ show_serving_board: v })}
          />
          <TemaMenuClienti settings={settings} onSave={save} />
        </div>
      ),
    },
    {
      // GESTIONE MENÙ: la schermata con cui si lavora il listino. Le sue
      // impostazioni non c'entrano niente con quello che vede il cliente.
      id: 'gestione-menu',
      icona: '🍹',
      label: 'Gestione menù',
      nodo: (
        <div className="card settings-section">
          <h3>Gestione menù</h3>
          <p className="muted small" style={{ margin: '0 0 10px' }}>
            La schermata con cui si modifica il listino, non quella dei clienti.
          </p>
          <h4>
            Cosa dice la riga a sinistra di ogni scheda?
          </h4>
          <SceltaModo
            colonne="1fr 1fr"
            valore={settings.stripe_menu || 'scorte'}
            opzioni={MODI_STRISCIA.map((m) => [m.id, m.label, m.desc])}
            onScegli={(v) => save({ stripe_menu: v })}
          />
          <p className="muted small" style={{ margin: '8px 0 4px' }}>
            Quale colore per «ci sono abbastanza scorte»?
          </p>
          <SceltaModo
            valore={!!settings.stripe_menu_ok_verde}
            opzioni={[
              [false, '⚪ Grigio'],
              [true, '🟢 Verde'],
            ]}
            onScegli={(v) => save({ stripe_menu_ok_verde: v })}
          />
        </div>
      ),
    },
    {
      id: 'coda',
      icona: '📋',
      label: 'Coda ordini',
      nodo: (
            <div className="card settings-section">
              <h3>Coda ordini</h3>
              <p className="muted" style={{ margin: '0 0 10px', fontSize: '0.85rem' }}>
                Come visualizzare gli ordini nel gestionale: <strong>griglia</strong> a
                tutto schermo (card affiancate, ideale su tablet), <strong>corsie</strong>
                di stato (una colonna per passo del lavoro, un tasto per card che manda
                l&apos;ordine al passo dopo), schede separate per stato, oppure
                un&apos;unica lista (in corso + evasi). Lo stato è sempre indicato dal
                colore e dall&apos;etichetta sulla card.
              </p>
              <SceltaModo
                valore={settings.queue_view}
                opzioni={[
                  ['griglia', '🔲 Griglia (schermo intero)'],
                  ['corsie', '🚦 Corsie di stato'],
                  ['tabs', '🗂 Schede per stato'],
                  ['lista', '📋 Lista unica'],
                ]}
                onScegli={(v) => save({ queue_view: v })}
              />

              {/* LA VISTA DEL BANCO. Non è un'altra vista della coda: è
                  un'altra coda, quella di chi prepara. Ad accenderla sono
                  gli STATI DEL SERVIZIO — senza quei passi non c'è niente
                  da mostrare — e qui si sceglie solo come disegnarla. Per
                  ora la scelta è una sola: si tiene lo stesso una fila di
                  voci, così quando se ne aggiunge un'altra non cambia
                  niente né qui né sui dati già salvati. */}
              <h4>La vista del banco</h4>
              <p className="muted" style={{ margin: '0 0 10px', fontSize: '0.85rem' }}>
                Chi sta al banco non guarda i conti, guarda il lavoro: le{' '}
                <strong>comande</strong>, una card per ticket, nel passo in cui stanno.
                {settings.workflow_enabled !== false ? (
                  <> Si apre da sé a chi ha il ruolo bartender.</>
                ) : (
                  <>
                    {' '}
                    Adesso non c’è: la accendono <strong>gli stati del servizio</strong>,
                    che sono spenti — senza quei passi non ci sarebbe niente da mostrare,
                    e al banco si vede la coda come la vedono tutti.
                  </>
                )}
              </p>
              <SceltaModo
                valore={settings.bartender_view || 'corsie'}
                opzioni={[
                  ['corsie', '🚦 Corsie di stato', undefined, settings.workflow_enabled === false],
                ]}
                onScegli={(v) => save({ bartender_view: v })}
              />

              {/* IL COLORE DEL CONTO. Serve quando un conto si spezza in
                  più comande che finiscono in colonne diverse: da lontano
                  il pallino è l'unica cosa che dice che sono lo stesso
                  tavolo. Il colore a mano si dà comunque, dal ⋯ della
                  card, acceso o spento che sia questo interruttore. */}
              <h4>Il colore del conto</h4>
              <ToggleRow
                label="Ogni conto nuovo nasce col suo colore"
                desc="Un pallino colorato accanto al numero, sulla card del conto e su tutte le card delle sue comande: due comande dello stesso conto si riconoscono anche da colonne diverse. Il colore si cambia o si toglie sempre dal «⋯ Azioni» della card, anche sui conti già aperti e anche con questo spento."
                checked={settings.conti_colorati === true}
                onChange={(v) => save({ conti_colorati: v })}
              />

              <h4>La ricerca</h4>
              <p className="muted" style={{ margin: '0 0 10px', fontSize: '0.85rem' }}>
                Cercando un numero, un nome, un tavolo o un drink: si può{' '}
                <strong>filtrare</strong> la coda, lasciando in pagina solo i conti che
                rispondono, oppure lasciarla com&apos;è e{' '}
                <strong>accendere</strong> il primo conto trovato, portandolo sotto gli
                occhi. Nel secondo modo la ricerca si azzera da sé appena si tocca un
                conto.
              </p>
              <SceltaModo
                valore={settings.queue_search || 'filtra'}
                opzioni={[
                  ['filtra', '🔍 Filtra la coda'],
                  ['evidenzia', '💡 Accendi il conto e portami lì'],
                ]}
                onScegli={(v) => save({ queue_search: v })}
              />
            </div>
      ),
    },
    { id: 'catalogo', icona: '📥', label: 'Catalogo prodotti', nodo: <CatalogImport /> },
    {
      id: 'account-clienti',
      icona: '🙋',
      label: 'Account clienti',
      nodo: (
            <div className="card settings-section">
              <h3>Account clienti</h3>
              <ToggleRow
                label="Login e registrazione clienti"
                desc="Se disattivato, il link «Accedi» e la registrazione spariscono dal lato cliente; lo staff continua ad accedere da /bar."
                checked={settings.customer_accounts_enabled}
                onChange={(v) => save({ customer_accounts_enabled: v })}
              />
            </div>
      ),
    },
    {
      id: 'posizione',
      icona: '📍',
      label: 'Posizione locale',
      nodo: (
            <div className="card settings-section">
              <h3>Posizione locale</h3>
              <ToggleRow
                label="Posizione obbligatoria per ordinare"
                desc="Il cliente deve trovarsi nei pressi del locale: senza localizzazione attiva non può ordinare. Lo staff è esente."
                checked={settings.geofence_enabled}
                onChange={(v) => save({ geofence_enabled: v })}
              />
              {settings.geofence_enabled && (
                <>
                  <label htmlFor="venue-addr">Indirizzo del locale</label>
                  <input
                    id="venue-addr"
                    type="text"
                    placeholder="es. Via Roma 1, Nola"
                    defaultValue={settings.venue_address}
                    onBlur={(e) => save({ venue_address: e.target.value.trim() })}
                  />
                  <div className="grid-2" style={{ marginTop: 10 }}>
                    <div>
                      <label htmlFor="venue-lat">Latitudine</label>
                      <input
                        id="venue-lat"
                        type="number"
                        step="0.000001"
                        defaultValue={settings.venue_lat ?? ''}
                        onBlur={(e) => save({ venue_lat: e.target.value === '' ? null : Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <label htmlFor="venue-lng">Longitudine</label>
                      <input
                        id="venue-lng"
                        type="number"
                        step="0.000001"
                        defaultValue={settings.venue_lng ?? ''}
                        onBlur={(e) => save({ venue_lng: e.target.value === '' ? null : Number(e.target.value) })}
                      />
                    </div>
                  </div>
                  <div className="toggle-row">
                    <span>Raggio consentito (metri)</span>
                    <AmountInput
                      value={settings.venue_radius_m}
                      min={10}
                      max={5000}
                      step={10}
                      onCommit={(v) => save({ venue_radius_m: v })}
                    />
                  </div>
                  <button
                    className="btn secondary block"
                    type="button"
                    onClick={() => {
                      navigator.geolocation?.getCurrentPosition(
                        (pos) =>
                          save({
                            venue_lat: Number(pos.coords.latitude.toFixed(6)),
                            venue_lng: Number(pos.coords.longitude.toFixed(6)),
                          }),
                        () => setError('Posizione non disponibile: inserisci le coordinate a mano.')
                      )
                    }}
                  >
                    📍 Usa la mia posizione attuale
                  </button>
                  {settings.venue_lat == null && (
                    <p className="muted small" style={{ margin: '8px 0 0' }}>
                      ⚠️ Senza coordinate il controllo non è attivo.
                    </p>
                  )}
                </>
              )}
            </div>
      ),
    },
    {
      id: 'notifiche',
      icona: '🔔',
      label: 'Notifiche',
      // CARTELLO, non una seconda casa. Gli avvisi sono scelti per persona
      // e per dispositivo, quindi stanno nel profilo — dove ci arriva
      // anche chi è in sala, che qui dentro non entra proprio. Qui resta
      // l'indicazione, perché chi li cercava li cercava qui.
      nodo: (
        <div className="card settings-section">
          <h3>🔔 Notifiche</h3>
          <p className="muted" style={{ margin: '0 0 12px', fontSize: '0.9rem' }}>
            Gli avvisi sono una scelta <strong>tua e di questo dispositivo</strong> —
            il tablet della cassa e il telefono in sala vogliono cose diverse,
            anche con lo stesso accesso — quindi stanno nel tuo profilo,
            insieme allo storico di quelli arrivati qui.
          </p>
          <Link className="btn small" to="/profilo-staff">
            👤 Vai al mio profilo
          </Link>

        </div>
      ),
    },
    { id: 'stampante', icona: '🖨️', label: 'Stampante', nodo: <PrinterSetup /> },
    // I CAMPI DELLA CARTA STANNO COL RESTO DELLA STAMPANTE. Sono
    // impostazioni del LOCALE (settings/bar) e non del terminale, ma chi
    // le cerca le cerca dove sta la stampante: nella barra sono un gruppo
    // solo, e questi riquadri vengono sotto a quello della connessione.
    {
      id: 'campi-scontrino',
      icona: '🧾',
      label: 'Campi dello scontrino',
      nodo: <CampiStampa quale="scontrino" settings={settings} onSave={save} />,
    },
    {
      id: 'campi-comanda',
      icona: '📝',
      label: 'Campi della comanda',
      nodo: <CampiStampa quale="comanda" settings={settings} onSave={save} />,
    },
    {
      id: 'campi-acconto',
      icona: '🧾',
      label: 'Campi dell’acconto',
      nodo: <CampiStampa quale="acconto" settings={settings} onSave={save} />,
    },
    {
      id: 'logo-stampe',
      icona: '🖼',
      label: 'Logo sulle stampe',
      nodo: <LogoStampe settings={settings} onSave={save} role={role} />,
    },
    { id: 'backup', icona: '💾', label: 'Backup e ripristino', nodo: <BackupPanel role={role} /> },
    {
      id: 'informazioni',
      icona: 'ℹ️',
      label: 'Informazioni',
      nodo: <InfoTab />,
    },
    {
      id: 'funzioni-premium',
      icona: '🔒',
      label: 'Funzioni premium',
      nodo: <FunzioniPremium settings={settings} onSave={save} />,
    },
    {
      id: 'annullamenti',
      icona: '✖️',
      label: 'Annullamenti',
      nodo: (
            <div className="card settings-section">
              <h3>Annullamenti</h3>
              <p className="muted" style={{ margin: '0 0 10px', fontSize: '0.85rem' }}>
                Frase proposta di default quando annulli un ordine (modificabile di
                volta in volta nel dialog di annullamento).
              </p>
              {/* LA FRASE SEGUE IL MONDO DELLA CONSEGNA. «Prego recarsi al
                  bancone» ha senso solo dove il RITIRO esiste: in un locale a
                  solo servizio manda una persona a un bancone dove nessuno
                  la aspetta. La voce impossibile si spegne col motivo, non
                  sparisce — sparire fa dubitare di averla immaginata — e
                  quella evidenziata è quella che si applica davvero
                  (fraseAnnulloDefault), non l'impostazione impossibile
                  rimasta scritta. */}
              <SceltaModo
                valore={fraseAnnulloDefault(settings)}
                opzioni={Object.entries(CANCEL_PHRASES).map(([key, text]) => [
                  key,
                  text,
                  fraseAnnulloPossibile(key, settings)
                    ? undefined
                    : 'Qui non si ritira al banco: la frase manderebbe il cliente dove nessuno lo aspetta.',
                  !fraseAnnulloPossibile(key, settings),
                ])}
                onScegli={(v) => save({ cancel_phrase_default: v })}
              />
              {!fraseAnnulloPossibile('bancone', settings) && (
                <p className="muted small" style={{ margin: '8px 0 0' }}>
                  «Prego recarsi al bancone» non si può usare: il locale è a solo
                  servizio.{' '}
                  <button
                    type="button"
                    className="link-inline"
                    onClick={() => scegliSezione('consegna')}
                  >
                    Vai a Consegna ordine
                  </button>
                </p>
              )}
            </div>
      ),
    },
  ]

  // LE VOCI DEL SOTTOMENU SONO DIECI, NON VENTITRÉ. Ogni riquadro resta
  // com'è, ma appartiene a un GRUPPO — accorpati per «a cosa afferisce»
  // l'impostazione, non per la storia di come è nata: con ventitré voci
  // l'elenco era più lungo delle impostazioni.
  const GRUPPO_DI = {
    aspetto: 'aspetto',
    // Tre cose diverse, tre voci: quello che vedono i clienti, la
    // schermata con cui si lavora il listino, e l'importazione del
    // catalogo. Messe insieme, davanti a un interruttore non si capiva a
    // quale delle tre appartenesse.
    'menu-clienti': 'menu-clienti',
    'gestione-menu': 'gestione-menu',
    catalogo: 'catalogo',
    coda: 'banco',
    'vista-ordine': 'banco',
    consegna: 'servizio',
    preparazione: 'servizio',
    tempi: 'servizio',
    annullamenti: 'servizio',
    pagamenti: 'cassa',
    // QUANDO parte la carta è una faccenda dell'incasso, non della
    // macchina: sta con la cassa, non con la stampante (REQ-UI-025).
    'stampa-automatica': 'cassa',
    giornata: 'cassa',
    prezzo: 'prezzi',
    sconto: 'prezzi',
    coperto: 'prezzi',
    'servizio-mancia': 'prezzi',
    gruppi: 'gruppi',
    'account-clienti': 'clienti',
    posizione: 'clienti',
    notifiche: 'clienti',
    stampante: 'stampante',
    'campi-scontrino': 'stampante',
    'campi-comanda': 'stampante',
    'campi-acconto': 'stampante',
    'logo-stampe': 'stampante',
    backup: 'sistema',
    informazioni: 'sistema',
    'funzioni-premium': 'premium',
  }
  const GRUPPI = [
    { id: 'aspetto', icona: '🎨', label: 'Aspetto' },
    { id: 'menu-clienti', icona: '📖', label: 'Menù clienti' },
    { id: 'gestione-menu', icona: '🍹', label: 'Gestione menù' },
    { id: 'catalogo', icona: '📥', label: 'Catalogo prodotti' },
    { id: 'banco', icona: '🧾', label: 'Banco: coda e ordine' },
    { id: 'servizio', icona: '🛎', label: 'Servizio' },
    { id: 'cassa', icona: '💳', label: 'Cassa e giornata' },
    { id: 'prezzi', icona: '🏷️', label: 'Prezzi e supplementi' },
    { id: 'gruppi', icona: '👥', label: 'Gruppi di ordini' },
    { id: 'clienti', icona: '🙋', label: 'Clienti' },
    { id: 'stampante', icona: '🖨️', label: 'Stampante' },
    // UN GRUPPO SUO, e non una voce infilata nei gruppi delle schermate che
    // le funzioni accendono. La regola del momento d'uso (REQ-UI-025) dice
    // di raggruppare per «quando lo cerco»: qui il momento è «cosa ha questo
    // locale, e cosa potrebbe avere», che non è il momento in cui si conta
    // il magazzino né quello in cui si registra una fattura — tanto più che
    // a modulo spento quelle schermate non ci sono, e cercare l'interruttore
    // dentro la sezione che non compare sarebbe una caccia. Sono la prima
    // famiglia di questo tipo e ne arriveranno altre (Fase 3 del piano ne
    // elenca cinque pacchetti): un gruppo che cresce è meglio di cinque voci
    // sparse. E non sta in «Sistema», che parla di questa installazione
    // (backup, versione): la licenza è del locale, non della macchina.
    { id: 'premium', icona: '🔒', label: 'Funzioni premium' },
    { id: 'sistema', icona: '💾', label: 'Sistema' },
  ]
  // Compat coi collegamenti vecchi (?sezione=coperto): l'id di un riquadro
  // porta al gruppo che lo contiene.
  const attiva =
    GRUPPI.find((g) => g.id === sezione) ??
    GRUPPI.find((g) => g.id === GRUPPO_DI[sezione]) ??
    GRUPPI[0]
  const riquadri = sezioni.filter((s) => GRUPPO_DI[s.id] === attiva.id)

  return (
    <div className="pagina-impostazioni">
      {/* Il titolo sta nella barra in alto (vedi lib/sezioni.js), e con lui
          l'elenco delle sezioni: in pagina costava una colonna intera. */}
      <Sottosezioni
        voci={GRUPPI.map((x) => ({ id: x.id, icona: x.icona, label: x.label }))}
        attiva={attiva.id}
        scegli={scegliSezione}
      />
      {error && <div className="banner">Errore: {error}</div>}

      {confermaSpegni && (
        <ConfirmDialog
          title="Spegnere la gestione della preparazione?"
          message={
            'I conti ancora aperti tornano tutti a “ricevuto”: senza la gestione ' +
            'non ci sarebbero più i tasti per farli avanzare. Le scorte già ' +
            'scalate restano scalate (il drink è stato fatto davvero) e non ' +
            'verranno scalate di nuovo se riaccendi la gestione.'
          }
          confirmLabel="Spegni e riporta a ricevuto"
          cancelLabel="Annulla"
          onCancel={() => setConfermaSpegni(false)}
          onConfirm={async () => {
            setConfermaSpegni(false)
            setEsitoReset(null)
            try {
              const n = await resetOpenOrdersToReceived()
              await save({ workflow_enabled: false })
              setEsitoReset(n)
            } catch (e) {
              setError(e.message)
            }
          }}
        />
      )}

      {/* Le sezioni stanno nella barra in alto (il titolo è il comando):
          a sinistra costavano una colonna tutto il giorno per una scelta che
          si fa ogni tanto. I riquadri del gruppo scelto si impilano. */}
      <div className="tab-corpo">
        {riquadri.map((s) => (
          <div key={s.id}>{s.nodo}</div>
        ))}
      </div>
    </div>
  )
}

// Import del catalogo prodotti da un export CSV di SumUp ("carte").
// Sostituisce drinks e categories dopo conferma con riepilogo.
function CatalogImport() {
  const fileRef = useRef(null)
  const [parsed, setParsed] = useState(null) // { products, categories, skipped }
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState(null)
  const [error, setError] = useState(null)

  async function onPickFile(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // permette di riselezionare lo stesso file
    if (!file) return
    setError(null)
    setLog(null)
    try {
      const text = decodeCsvBuffer(await file.arrayBuffer())
      setParsed(parseCarteCsv(text))
    } catch (err) {
      setError(err.message)
    }
  }

  async function doImport() {
    const data = parsed
    setParsed(null)
    setBusy(true)
    setError(null)
    try {
      await replaceCatalog(data, (msg) => setLog(msg))
      setLog(`✓ Importati ${data.products.length} prodotti in ${data.categories.length} categorie.`)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card settings-section">
      <h3>Catalogo prodotti</h3>
      <div className="toggle-row" style={{ borderBottom: 'none' }}>
        <div>
          <div>Importa da CSV SumUp</div>
          <div className="desc">
            Carica l&apos;export prodotti («carte») di SumUp: sostituisce
            l&apos;intero menù e le categorie. Foto e ricette esistenti
            vengono perse.
          </div>
        </div>
        <button
          className="btn small"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          {busy ? 'Importo…' : 'Carica CSV'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          style={{ display: 'none' }}
          onChange={onPickFile}
        />
      </div>
      {error && <div className="banner">Errore: {error}</div>}
      {log && <p className="muted small" style={{ margin: '6px 0 0' }}>{log}</p>}

      {parsed && (
        <ConfirmDialog
          title="📦 Importare il catalogo?"
          message={
            `${parsed.products.length} prodotti in ${parsed.categories.length} categorie:\n` +
            parsed.categories.join(', ') +
            (parsed.skipped ? `\n\n(${parsed.skipped} righe non valide saltate)` : '') +
            '\n\nIl menù attuale verrà sostituito.'
          }
          confirmLabel="Importa"
          danger
          onCancel={() => setParsed(null)}
          onConfirm={doImport}
        />
      )}
    </div>
  )
}

// Pairing del lettore SumUp Solo: il codice si genera dal lettore
// (Menu → Connessioni → API). L'associazione la fa una Cloud Function
// (la chiave API non passa mai dal client); lo stato arriva dai settings.
function ReaderPairing({ settings }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [confirmUnpair, setConfirmUnpair] = useState(false)

  async function associa() {
    setBusy(true)
    setError(null)
    try {
      const res = await pairSumUpReader(code.trim())
      if (res.unavailable) {
        setError('Non disponibile in ambiente di sviluppo (nessuna Cloud Function).')
      } else {
        setCode('')
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function dissocia() {
    setConfirmUnpair(false)
    setBusy(true)
    setError(null)
    try {
      await unpairSumUpReader()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ marginTop: 10 }}>
      {error && <div className="banner">Errore: {error}</div>}
      {settings.sumup_reader_id ? (
        <div className="toggle-row">
          <div>
            <div>📟 {settings.sumup_reader_name || 'Lettore SumUp'}</div>
            <div className="desc">Lettore associato e pronto all&apos;incasso.</div>
          </div>
          <button className="btn ghost small" disabled={busy} onClick={() => setConfirmUnpair(true)}>
            Dissocia
          </button>
        </div>
      ) : (
        <>
          <p className="muted small" style={{ margin: '0 0 8px' }}>
            Sul lettore: Menu → Connessioni → API → genera il codice di
            pairing e inseriscilo qui (vale 5 minuti).
          </p>
          {devToolsEnabled && (
            <button
              className="btn ghost small block"
              style={{ marginBottom: 8 }}
              disabled={busy}
              onClick={() =>
                updateSettings({ sumup_reader_id: 'sim', sumup_reader_name: 'Simulato' }).catch(
                  (e) => setError(e.message)
                )
              }
            >
              🧪 Usa un lettore SIMULATO (solo test): l&apos;esito arriva da solo dopo 2,5s
            </button>
          )}
          <div className="row" style={{ gap: 8 }}>
            <input
              type="text"
              placeholder="Codice di pairing"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              style={{ textTransform: 'uppercase' }}
            />
            <button
              className="btn small"
              disabled={busy || !code.trim()}
              onClick={associa}
              style={{ flexShrink: 0 }}
            >
              {busy ? 'Associo…' : '🔗 Associa'}
            </button>
          </div>
        </>
      )}
      {confirmUnpair && (
        <ConfirmDialog
          title="Dissociare il lettore?"
          message="Per usarlo di nuovo servirà un nuovo codice di pairing."
          confirmLabel="Dissocia"
          danger
          onCancel={() => setConfirmUnpair(false)}
          onConfirm={dissocia}
        />
      )}
    </div>
  )
}

// ── QUALI AVVISI VOGLIO, SU QUESTO SCHERMO ───────────────────────────
// Le notifiche non servono a tutti allo stesso modo: al banco «nuovo
// ordine» è la cosa più importante della serata, in sala serve «pronto», e
// chi tiene il portatile nel retro non vuole niente. La scelta è di chi
// guarda QUESTO schermo — non una regola del bar — quindi resta sul
// dispositivo e vale per la persona collegata: due che si passano lo stesso
// tablet nei cambi turno non si sovrascrivono a vicenda.
// LE PASTIGLIE «SCEGLI UN MODO». Una fila di scelte che si escludono a
// vicenda, quella in vigore accesa, un tocco salva: in questa schermata
// compare quattordici volte, ed era scritta quattordici volte — cambiare
// una pastiglia voleva dire cambiarla in quattordici posti.
//
// Ogni opzione e' `[valore, etichetta, spiegazione?, spenta?]`. Una voce
// impossibile resta A VISTA, spenta, con il motivo nella spiegazione:
// sparire fa dubitare di averla immaginata.
function SceltaModo({ valore, opzioni, onScegli, colonne }) {
  return (
    <div className="mode-choice" style={colonne ? { gridTemplateColumns: colonne } : undefined}>
      {opzioni.map(([id, etichetta, spiegazione, spenta]) => (
        <button
          key={String(id)}
          className={`mode-option${valore === id ? ' active' : ''}`}
          disabled={spenta}
          title={spiegazione}
          onClick={() => onScegli(id)}
        >
          {etichetta}
        </button>
      ))}
    </div>
  )
}

// Input numerico che salva solo al blur/invio, per non scrivere su Firestore
// ad ogni tasto premuto.
function AmountInput({ value, min, max, step, onCommit }) {
  const [val, setVal] = useState(String(value ?? ''))

  useEffect(() => {
    setVal(String(value ?? ''))
  }, [value])

  function commit() {
    let n = Number(val)
    if (!Number.isFinite(n)) n = value
    if (min != null) n = Math.max(min, n)
    if (max != null) n = Math.min(max, n)
    setVal(String(n))
    if (n !== value) onCommit(n)
  }

  return (
    <input
      className="setting-amount"
      type="number"
      inputMode="decimal"
      min={min}
      max={max}
      step={step}
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
    />
  )
}

// ── LE FUNZIONI PREMIUM ───────────────────────────────────
// Cosa ha questo locale, e cosa potrebbe avere. Anche quelle che NON ha
// restano in elenco APPOSTA (decisione dell'utente, 26/08/2026): sparite
// del tutto, nessuno saprebbe che esistono, e chi le ha viste una volta si
// chiederebbe dove sono finite.
//
// DUE RIGHE DIVERSE, e lo si vede (lib/licenza.js):
// · modulo NON INCLUSO — interruttore spento e bloccato, che al tocco dice
//   perché. Cosa il locale ha comprato non si decide da qui.
// · modulo INCLUSO — interruttore NORMALE: si accende e si spegne come
//   ogni altra impostazione. Resta scritto che è una funzione premium, ma
//   «non inclusa» su una funzione che il locale ha sarebbe falso.
function FunzioniPremium({ settings, onSave }) {
  return (
    <div className="card settings-section">
      <h3>Funzioni premium</h3>
      <p className="muted" style={{ margin: '0 0 10px', fontSize: '0.85rem' }}>
        Funzioni che fanno parte della licenza dell’installazione. Quelle
        incluse si accendono e si spengono da qui; le altre sono elencate per
        sapere che esistono e cosa fanno.
      </p>
      {moduliPremium().map((m) => {
        const incluso = moduloIncluso(settings, m.id)
        return (
          <ToggleRow
            key={m.id}
            label={m.label}
            desc={`${m.descrizione} ${
              incluso
                ? 'Funzione premium, inclusa in questa installazione.'
                : 'Funzione premium: non inclusa.'
            }`}
            checked={moduloAttivo(settings, m.id)}
            motivo={incluso ? undefined : MOTIVO_PREMIUM}
            onChange={(v) => onSave({ [chiaveModulo(m.id)]: v })}
          />
        )
      })}
    </div>
  )
}
