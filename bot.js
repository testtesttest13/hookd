#!/usr/bin/env node
/*
  hookd. — bot Telegram /start + menu
  Usage (Node 18+) :
    node bot.js

  Le bot utilise le long polling (getUpdates) donc pas besoin de serveur.
  Garde la fenêtre ouverte tant que tu veux qu'il réponde à /start.

  Pour le rendre always-on :
    - Linux/Mac : pm2 start bot.js --name hookd-bot
    - Windows   : NSSM ou laisser tourner dans un terminal
*/

const TOKEN        = "8702556193:AAGMt2iZWxoyjArFfL95BSHSkrPMxzPo5mc";
const ADMIN_CHAT   = 5445357219;
const GROUP_CHAT   = -5112129426;              // Groupe "Hookd"
const ALLOWED      = new Set([ADMIN_CHAT, GROUP_CHAT]);
const SITE_URL     = "https://hookd.click";
const API          = `https://api.telegram.org/bot${TOKEN}`;

async function call(method, body){
  const r = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: body ? JSON.stringify(body) : undefined
  });
  const j = await r.json();
  if(!j.ok) console.error(method, 'err', j);
  return j;
}

async function registerCommands(){
  return call('setMyCommands', {
    commands: [
      {command:'start',   description:'Accueil + menu principal'},
      {command:'menu',    description:'Afficher le menu'},
      {command:'leads',   description:'Dernières demandes'},
      {command:'sample',  description:'Échantillons gratuits'},
      {command:'stats',   description:'Lien vers les stats'},
      {command:'site',    description:'Ouvrir hookd.click'},
      {command:'help',    description:'Aide & commandes'}
    ]
  });
}

function mainMenuMarkup(){
  return {
    inline_keyboard: [
      [{text:'📋 Dernières demandes',  callback_data:'leads'}],
      [{text:'🎁 Échantillons gratuits', callback_data:'sample'}],
      [{text:'📊 Statistiques Vercel',   url:'https://vercel.com/dashboard'},
       {text:'🌐 hookd.click',           url: SITE_URL}],
      [{text:'ℹ️ Aide',                  callback_data:'help'}]
    ]
  };
}

const VIEWS = {
  welcome: {
    text:
      "👋 *Salut Jorys.*\n\n" +
      "Bienvenue sur ton bot hookd.\n" +
      "Les leads de la landing arrivent ici en direct.\n\n" +
      "Choisis ce que tu veux voir 👇",
    markup: mainMenuMarkup
  },
  leads: {
    text:
      "📋 *Dernières demandes*\n\n" +
      "Les leads du formulaire onboarding arrivent dans ce chat en temps réel.\n" +
      "👆 _Scroll up pour voir l'historique complet._\n\n" +
      "Tag reconnaissable : `🔔 NOUVEAU LEAD hookd.`",
    markup: () => ({ inline_keyboard:[[{text:'← Retour au menu', callback_data:'menu'}]] })
  },
  sample: {
    text:
      "🎁 *Échantillons gratuits*\n\n" +
      "Quand quelqu'un demande un échantillon via la section \"Pas convaincu ? Teste gratuitement\", tu reçois un message ici avec :\n" +
      "• email\n• lien produit\n• audience cible\n• problème à résoudre\n\n" +
      "Tag reconnaissable : `🎁 ÉCHANTILLON GRATUIT`",
    markup: () => ({ inline_keyboard:[[{text:'← Retour au menu', callback_data:'menu'}]] })
  },
  help: {
    text:
      "*Aide — commandes*\n\n" +
      "/start · /menu — menu principal\n" +
      "/leads — rappel sur les demandes\n" +
      "/sample — rappel sur les échantillons\n" +
      "/stats — Vercel analytics\n" +
      "/site — ouvrir hookd.click\n" +
      "/help — cette aide\n\n" +
      "Le bot répond uniquement à toi (chat ID vérifié).",
    markup: () => ({ inline_keyboard:[[{text:'← Retour au menu', callback_data:'menu'}]] })
  }
};

async function sendView(chatId, key){
  const v = VIEWS[key] || VIEWS.welcome;
  return call('sendMessage', {
    chat_id: chatId,
    text: v.text,
    parse_mode: 'Markdown',
    reply_markup: v.markup()
  });
}

async function editView(chatId, messageId, key){
  const v = VIEWS[key] || VIEWS.welcome;
  return call('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text: v.text,
    parse_mode: 'Markdown',
    reply_markup: v.markup()
  });
}

async function handleUpdate(upd){
  if(upd.message){
    const m = upd.message;
    if(!ALLOWED.has(m.chat.id)) return;
    const text = (m.text || '').trim();
    if(text === '/start' || text === '/menu') return sendView(m.chat.id, 'welcome');
    if(text === '/leads')  return sendView(m.chat.id, 'leads');
    if(text === '/sample') return sendView(m.chat.id, 'sample');
    if(text === '/help')   return sendView(m.chat.id, 'help');
    if(text === '/site')   return call('sendMessage', {
      chat_id: m.chat.id,
      text: `🌐 ${SITE_URL}`,
      reply_markup: { inline_keyboard:[[{text:'Ouvrir le site', url: SITE_URL}]] }
    });
    if(text === '/stats')  return call('sendMessage', {
      chat_id: m.chat.id,
      text: "📊 Ton dashboard Vercel :",
      reply_markup: { inline_keyboard:[[{text:'Ouvrir Vercel', url:'https://vercel.com/dashboard'}]] }
    });
  }
  if(upd.callback_query){
    const cb = upd.callback_query;
    const chatId = cb.message.chat.id;
    if(!ALLOWED.has(chatId)) return;
    await call('answerCallbackQuery', { callback_query_id: cb.id });
    const key = cb.data === 'menu' ? 'welcome' : cb.data;
    return editView(chatId, cb.message.message_id, key);
  }
}

let offset = 0;

async function loop(){
  while(true){
    try {
      const r = await call('getUpdates', { offset, timeout: 25 });
      if(r.ok && Array.isArray(r.result)){
        for(const upd of r.result){
          offset = upd.update_id + 1;
          try { await handleUpdate(upd); } catch(e){ console.error('handle err', e); }
        }
      }
    } catch(e){
      console.error('poll err', e);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

(async () => {
  const me = await call('getMe');
  if(!me.ok){ console.error('bot invalide — vérifie le token'); process.exit(1); }
  console.log(`🤖 ${me.result.first_name} (@${me.result.username}) prêt.`);
  await registerCommands();
  console.log('✓ commandes enregistrées');
  console.log('→ envoie /start à ton bot pour tester');
  loop();
})();
