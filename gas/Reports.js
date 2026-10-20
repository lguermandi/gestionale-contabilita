const REPORT_MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
const MONITORED_ACCOUNTS = ['crediti v/altri', 'crediti v/genitori', 'debiti v/altri', 'debiti diversi'];

function parseTransactions_(rows) {
  const transactions = [];
  let entries = [];
  let runningDare = 0;
  let runningAvere = 0;
  let counter = 1;

  rows.forEach(row => {
    const dare = Number(row[5]) || 0;
    const avere = Number(row[6]) || 0;
    if (dare === 0 && avere === 0) {
      return;
    }

    const date = formatTransactionDate_(row[0]);
    entries.push({
      conto: sanitizeString_(row[2]),
      descrizione: sanitizeString_(row[3]),
      gestione: sanitizeString_(row[4]),
      dare: Number(dare.toFixed(2)),
      avere: Number(avere.toFixed(2))
    });

    runningDare += dare;
    runningAvere += avere;
    if (Math.abs(runningDare - runningAvere) < 0.01 && runningDare > 0) {
      transactions.push({
        id: `TX-${date}-${String(counter).padStart(3, '0')}`,
        data: date,
        totale: Number(runningDare.toFixed(2)),
        movimenti: entries
      });
      entries = [];
      runningDare = 0;
      runningAvere = 0;
      counter += 1;
    }
  });

  if (entries.length > 0) {
    console.warn('Trovate righe contabili non bilanciate alla fine del foglio.');
  }

  return transactions;
}

function calculateBalances_(transactions) {
  const balances = {};
  transactions.forEach(transaction => transaction.movimenti.forEach(movement => {
    if (!movement.conto) {
      return;
    }
    if (!balances[movement.conto]) {
      balances[movement.conto] = {
        conto: movement.conto,
        totale_dare: 0,
        totale_avere: 0,
        saldo: 0
      };
    }
    balances[movement.conto].totale_dare += movement.dare;
    balances[movement.conto].totale_avere += movement.avere;
  }));

  return Object.values(balances).map(account => {
    account.totale_dare = Number(account.totale_dare.toFixed(2));
    account.totale_avere = Number(account.totale_avere.toFixed(2));
    account.saldo = Number((account.totale_dare - account.totale_avere).toFixed(2));
    return account;
  }).sort((left, right) => left.conto.localeCompare(right.conto));
}

function generateMonthlyReport_(transactions) {
  const matrix = {};
  transactions.forEach(transaction => {
    const month = transaction.data.split('-')[1];
    if (!REPORT_MONTHS.includes(month)) {
      return;
    }
    transaction.movimenti.forEach(movement => {
      if (!movement.gestione || !movement.gestione.trim()) {
        return;
      }
      if (!matrix[movement.conto]) {
        matrix[movement.conto] = {
          conto: movement.conto,
          gestione: movement.gestione,
          totale_anno: 0
        };
        REPORT_MONTHS.forEach(item => matrix[movement.conto][item] = 0);
      }
      const net = movement.dare - movement.avere;
      matrix[movement.conto][month] += net;
      matrix[movement.conto].totale_anno += net;
    });
  });

  return Object.values(matrix).map(row => {
    REPORT_MONTHS.forEach(month => row[month] = Number(row[month].toFixed(2)));
    row.totale_anno = Number(row.totale_anno.toFixed(2));
    return row;
  }).sort((left, right) => left.conto.localeCompare(right.conto));
}

function generateGestioniReport_(transactions) {
  const gestioni = {};
  transactions.forEach(transaction => transaction.movimenti.forEach(movement => {
    if (!movement.gestione || !movement.gestione.trim()) {
      return;
    }
    const name = movement.gestione.toLowerCase();
    if (!gestioni[name]) {
      gestioni[name] = {
        gestione: name,
        totale_costi: 0,
        totale_ricavi: 0,
        utile: 0
      };
    }
    gestioni[name].totale_costi += movement.dare;
    gestioni[name].totale_ricavi += movement.avere;
  }));

  return Object.values(gestioni).map(item => {
    item.totale_costi = Number(item.totale_costi.toFixed(2));
    item.totale_ricavi = Number(item.totale_ricavi.toFixed(2));
    item.utile = Number((item.totale_ricavi - item.totale_costi).toFixed(2));
    item.margine = item.totale_ricavi > 0
      ? `${Number((item.utile / item.totale_ricavi * 100).toFixed(1))}%`
      : 'N/A';
    return item;
  });
}

function generateTimeSeries_(transactions) {
  const daily = {};
  transactions.forEach(transaction => {
    if (!daily[transaction.data]) {
      daily[transaction.data] = [];
    }
    daily[transaction.data].push(...transaction.movimenti);
  });

  const balances = {};
  return Object.keys(daily).sort().map(date => {
    daily[date].forEach(movement => {
      if (!movement.conto) {
        return;
      }
      balances[movement.conto] = (balances[movement.conto] || 0) + movement.dare - movement.avere;
    });

    const snapshot = { data: date };
    Object.keys(balances).forEach(account => {
      if (Math.abs(balances[account]) > 0.01) {
        snapshot[account] = Number(balances[account].toFixed(2));
      }
    });
    return snapshot;
  });
}

function generateOpenPositions_(transactions) {
  const positions = {};
  transactions.forEach(transaction => transaction.movimenti.forEach(movement => {
    if (!movement.conto || !movement.descrizione ||
        !MONITORED_ACCOUNTS.includes(movement.conto.toLowerCase())) {
      return;
    }

    const subject = movement.descrizione.trim();
    if (!subject) {
      return;
    }
    if (!positions[subject]) {
      positions[subject] = {
        soggetto: subject,
        conto_origine: movement.conto,
        totale_dare: 0,
        totale_avere: 0,
        saldo_netto: 0
      };
    }
    positions[subject].totale_dare += movement.dare;
    positions[subject].totale_avere += movement.avere;
  }));

  return Object.values(positions).map(position => {
    position.saldo_netto = Number((position.totale_dare - position.totale_avere).toFixed(2));
    return position;
  }).filter(position => Math.abs(position.saldo_netto) > 0.01)
    .sort((left, right) => right.saldo_netto - left.saldo_netto);
}

function formatTransactionDate_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return value ? String(value).trim().split('T')[0] : '';
}

function sanitizeString_(value) {
  return String(value || '').trim().replace(/[\x00-\x1F\x7F]/g, '').slice(0, 200);
}
