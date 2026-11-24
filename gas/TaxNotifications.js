const TAX_NOTIFICATION_PREFIX_ = 'TAX_NOTIFICATION_CONFIG_';
const TAX_NOTIFICATION_SENT_PREFIX_ = 'TAX_NOTIFICATION_SENT_';
const TAX_DASHBOARD_URL_ = 'https://lguermandi.github.io/gestionale-contabilita/';

function getTaxNotificationSettings_(token, spreadsheetId) {
  getSpreadsheetForSession_(token, spreadsheetId);
  const properties = PropertiesService.getScriptProperties();
  const saved = properties.getProperty(TAX_NOTIFICATION_PREFIX_ + spreadsheetId);
  if (!saved) {
    return {
      settings: { email: '', daysBefore: 14, enabled: false },
      deadlines: []
    };
  }
  const config = JSON.parse(saved);
  return {
    settings: config.settings,
    deadlines: (config.deadlines || []).map(deadline => ({
      ...deadline,
      calendarYear: Number(deadline.calendarYear || String(deadline.id || '').slice(0, 4)
        || String(deadline.date || '').slice(0, 4))
    }))
  };
}

function saveTaxNotificationSettings_(token, spreadsheetId, entityId, entityName, calendarYear, settings, deadlines) {
  getSpreadsheetForSession_(token, spreadsheetId);
  const normalizedSettings = normalizeTaxNotificationSettings_(settings);
  const selectedYear = Number(calendarYear);
  if (!Number.isInteger(selectedYear) || selectedYear < 2000 || selectedYear > 2100) {
    throw new Error('Anno del calendario non valido.');
  }
  const normalizedDeadlines = normalizeTaxNotificationDeadlines_(deadlines, selectedYear);
  const normalizedEntityId = String(entityId || '');
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(normalizedEntityId)) {
    throw new Error('Identificativo entità non valido.');
  }
  const entityRecord = getEntityRecordBySpreadsheetId_(spreadsheetId);
  if (String(entityRecord.id) !== normalizedEntityId) {
    throw new Error('L’entità selezionata non corrisponde al foglio attivo.');
  }
  if (normalizedSettings.enabled && !normalizedSettings.email) {
    throw new Error('Inserisci un indirizzo email prima di attivare i promemoria.');
  }
  const properties = PropertiesService.getScriptProperties();
  const propertyKey = TAX_NOTIFICATION_PREFIX_ + spreadsheetId;
  const previous = properties.getProperty(propertyKey);
  const existingDeadlines = previous ? JSON.parse(previous).deadlines || [] : [];
  const retainedDeadlines = existingDeadlines.filter(deadline => {
    const deadlineYear = Number(deadline.calendarYear || String(deadline.id || '').slice(0, 4)
      || String(deadline.date || '').slice(0, 4));
    return deadlineYear !== selectedYear;
  });
  const config = {
    entityId: normalizedEntityId,
    entityName: sanitizeString_(entityName) || 'Entità contabile',
    spreadsheetId: String(spreadsheetId),
    settings: normalizedSettings,
    deadlines: retainedDeadlines.concat(normalizedDeadlines)
  };
  properties.setProperty(propertyKey, JSON.stringify(config));
  return { settings: normalizedSettings, saved: true };
}

function sendTaxNotificationTest_(token, spreadsheetId, entityName, settings, dashboardUrl) {
  getSpreadsheetForSession_(token, spreadsheetId);
  const normalizedSettings = normalizeTaxNotificationSettings_(settings);
  if (!normalizedSettings.email) {
    throw new Error('Inserisci un indirizzo email destinatario.');
  }
  const url = normalizeTaxDashboardUrl_(dashboardUrl);
  MailApp.sendEmail({
    to: normalizedSettings.email,
    subject: 'Promemoria di prova - Tasse e scadenze',
    body: [
      'Questa è un’email di prova delle notifiche fiscali.',
      '',
      'Entità: ' + (sanitizeString_(entityName) || 'Entità contabile'),
      'Le notifiche automatiche sono ' + (normalizedSettings.enabled ? 'attive.' : 'disattive.'),
      '',
      'Apri il gestionale: ' + url
    ].join('\n')
  });
  return { sent: true };
}

function installTaxNotificationTrigger() {
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === 'checkUpcomingTaxDeadlines') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  ScriptApp.newTrigger('checkUpcomingTaxDeadlines')
    .timeBased()
    .everyDays(1)
    .atHour(8)
    .create();
  return 'Trigger giornaliero installato. L’orario segue il fuso impostato nel progetto Apps Script.';
}

function authorizeTaxNotifications_() {
  const remaining = MailApp.getRemainingDailyQuota();
  return 'Servizio email autorizzato. Quota residua destinatari oggi: ' + remaining;
}

function checkUpcomingTaxDeadlines() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { sent: 0, skipped: true };
  try {
    const properties = PropertiesService.getScriptProperties();
    const allProperties = properties.getProperties();
    const todayString = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    const today = parseTaxDate_(todayString);
    let sentCount = 0;

    Object.keys(allProperties)
      .filter(key => key.indexOf(TAX_NOTIFICATION_PREFIX_) === 0)
      .forEach(key => {
        const config = JSON.parse(allProperties[key]);
        if (!config.settings || !config.settings.enabled || !config.settings.email) return;
        (config.deadlines || []).forEach(deadline => {
          if (deadline.paid || !deadline.date) return;
          const dueDate = parseTaxDate_(deadline.date);
          const daysUntil = Math.round((dueDate.getTime() - today.getTime()) / 86400000);
          if (daysUntil < 0 || daysUntil > config.settings.daysBefore) return;
          const year = Number(deadline.calendarYear || String(deadline.id || '').slice(0, 4)
            || deadline.date.slice(0, 4));
          const sentKey = TAX_NOTIFICATION_SENT_PREFIX_ + config.entityId + '_' + deadline.id + '_' + year;
          if (properties.getProperty(sentKey)) return;
          MailApp.sendEmail({
            to: config.settings.email,
            subject: 'Scadenza fiscale tra ' + daysUntil + ' giorni - ' + deadline.title,
            body: buildTaxDeadlineEmail_(config, deadline, daysUntil)
          });
          properties.setProperty(sentKey, new Date().toISOString());
          sentCount += 1;
        });
      });
    return { sent: sentCount };
  } finally {
    lock.releaseLock();
  }
}

function normalizeTaxNotificationSettings_(settings) {
  const source = settings || {};
  const email = String(source.email || '').trim();
  const daysBefore = Number(source.daysBefore);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Indirizzo email non valido.');
  }
  if (!isFinite(daysBefore) || daysBefore < 1 || daysBefore > 60) {
    throw new Error('I giorni di anticipo devono essere compresi tra 1 e 60.');
  }
  return { email: email, daysBefore: Math.floor(daysBefore), enabled: source.enabled === true };
}

function normalizeTaxNotificationDeadlines_(deadlines, calendarYear) {
  if (!Array.isArray(deadlines) || deadlines.length > 100) {
    throw new Error('Elenco delle scadenze non valido.');
  }
  return deadlines.map(deadline => {
    const item = deadline || {};
    const id = String(item.id || '');
    const date = String(item.date || '');
    const amount = Number(item.amount || 0);
    if (!/^[a-zA-Z0-9_-]{1,160}$/.test(id) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error('Una scadenza contiene un identificativo o una data non validi.');
    }
    const parsedDate = parseTaxDate_(date);
    if (Utilities.formatDate(parsedDate, Session.getScriptTimeZone(), 'yyyy-MM-dd') !== date) {
      throw new Error('Una scadenza contiene una data inesistente.');
    }
    if (!isFinite(amount) || amount < 0) throw new Error('Importo di scadenza non valido.');
    const f24 = Array.isArray(item.f24) ? item.f24.slice(0, 10).map(field => {
      if (!field || typeof field !== 'object') throw new Error('I dati F24 di una scadenza non sono validi.');
      const fieldAmount = Number(field.amount);
      const fieldYear = Number(field.year);
      if (!field || !['Erario', 'INPS'].includes(field.section) || !String(field.code || '').trim()
        || !isFinite(fieldAmount) || fieldAmount < 0 || !Number.isInteger(fieldYear)) {
        throw new Error('I dati F24 di una scadenza non sono validi.');
      }
      return {
        section: field.section,
        code: String(field.code).slice(0, 20),
        year: fieldYear,
        amount: Math.round(fieldAmount * 100) / 100
      };
    }) : [];
    const supportedKinds = ['iva', 'redditi', 'declaration', 'inps', 'bollo', 'personal'];
    if (item.kind && !supportedKinds.includes(item.kind)) {
      throw new Error('Tipo di scadenza non valido.');
    }
    return {
      id: id,
      date: date,
      calendarYear: calendarYear,
      kind: item.kind || undefined,
      title: sanitizeString_(item.title).slice(0, 200),
      description: sanitizeString_(item.description).slice(0, 500),
      amount: Math.round(amount * 100) / 100,
      paid: item.paid === true,
      f24: f24
    };
  });
}

function buildTaxDeadlineEmail_(config, deadline, daysUntil) {
  const date = deadline.date.split('-').reverse().join('/');
  const f24Rows = (deadline.f24 || []).map(field =>
    '- Sezione ' + field.section + ' | codice ' + field.code + ' | anno ' + field.year +
    ' | importo € ' + Number(field.amount || 0).toFixed(2).replace('.', ',')
  );
  return [
    'Ciao,',
    '',
    'ti ricordiamo una scadenza fiscale per ' + config.entityName + '.',
    '',
    'Scadenza: ' + deadline.title + ' - ' + date + ' (tra ' + daysUntil + ' giorni)',
    'Importo stimato: € ' + Number(deadline.amount || 0).toFixed(2).replace('.', ','),
    'Cosa fare: ' + (deadline.description || 'Controlla la scadenza e verifica l’importo prima del pagamento.'),
    '',
    'Dati per F24:',
    ...(f24Rows.length ? f24Rows : ['- Non sono disponibili dati F24 per questa scadenza.']),
    '',
    'Apri il gestionale: ' + TAX_DASHBOARD_URL_,
    '',
    'Stima informativa: verifica sempre importi, codici e termini con il tuo consulente.'
  ].join('\n');
}

function normalizeTaxDashboardUrl_(candidate) {
  const url = String(candidate || TAX_DASHBOARD_URL_);
  if (url !== TAX_DASHBOARD_URL_) throw new Error('URL della dashboard non riconosciuto.');
  return url;
}

function parseTaxDate_(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error('Data di scadenza non valida.');
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (date.getFullYear() !== Number(match[1]) || date.getMonth() !== Number(match[2]) - 1
    || date.getDate() !== Number(match[3])) {
    throw new Error('Data di scadenza inesistente.');
  }
  return date;
}
