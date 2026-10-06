/**
 * PB-DOCUMENT-INTAKE-001 — Entrega B: plantillas de notificación del canal
 * documental por correo, en los 11 idiomas de la app.
 *
 * ESTADO (GO del PO): PREPARADAS, NO cableadas a ningún envío. Durante la
 * fase TEST ningún correo sale a usuarios; si en una fase posterior se
 * activan, el destinatario de TEST es support@pipingbox.com con BCC de
 * auditoría info@pipingbox.com y asunto con prefijo "[TEST]". El envío real
 * requiere GO explícito del PO.
 *
 * Módulo PURO (sin Deno.*): testeable en Node.
 */

export const EMAIL_INTAKE_LOCALES = ['bg', 'de', 'en', 'es', 'fr', 'it', 'nl', 'pl', 'pt', 'ro', 'uk'] as const;
export type EmailIntakeLocale = (typeof EMAIL_INTAKE_LOCALES)[number];

export const EMAIL_INTAKE_TEMPLATE_KEYS = [
  'reference_created',
  'document_received',
  'document_rejected',
  'document_needs_review',
  'data_ready_for_confirmation',
  'reference_expired',
] as const;
export type EmailIntakeTemplateKey = (typeof EMAIL_INTAKE_TEMPLATE_KEYS)[number];

export interface RenderedTemplate {
  subject: string;
  text: string;
  html: string;
}

interface TemplateCopy {
  subject: string;
  /** Párrafos del cuerpo (texto plano; el HTML se genera con la shell de marca). */
  paragraphs: string[];
  cta?: string;
}

type Catalog = Record<EmailIntakeTemplateKey, Record<EmailIntakeLocale, TemplateCopy>>;

const BRAND_NAME = 'PipingBox';
const TEST_PREFIX = '[TEST] ';

/** Shell HTML de marca (logo textual; el logo gráfico se añade al cablear el envío). */
function htmlShell(copy: TemplateCopy): string {
  const paragraphs = copy.paragraphs
    .map((p) => `<p style="margin:0 0 16px;font:16px/1.5 Arial,sans-serif;color:#1f2937;">${escapeHtml(p)}</p>`)
    .join('');
  const cta = copy.cta
    ? `<p style="margin:24px 0;"><span style="display:inline-block;background:#0b5fff;color:#ffffff;padding:12px 24px;border-radius:6px;font:600 16px Arial,sans-serif;">${escapeHtml(copy.cta)}</span></p>`
    : '';
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f3f4f6;">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    <div style="background:#0b5fff;padding:16px 24px;border-radius:8px 8px 0 0;">
      <span style="font:700 20px Arial,sans-serif;color:#ffffff;">${BRAND_NAME}</span>
    </div>
    <div style="background:#ffffff;padding:32px 24px;border-radius:0 0 8px 8px;">
      ${paragraphs}
      ${cta}
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
      <p style="margin:0;font:12px/1.5 Arial,sans-serif;color:#6b7280;">${BRAND_NAME} — Document intake</p>
    </div>
  </div>
</body></html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const en: Record<EmailIntakeTemplateKey, TemplateCopy> = {
  reference_created: {
    subject: 'Your document upload by email — instructions inside',
    paragraphs: [
      'You asked to send us a document by email. Send your file as an attachment to the address shown in the app, keeping the reference in the subject line unchanged.',
      'Allowed formats: PDF, PNG or JPG (max 10 MB). The reference expires in 72 hours and can be used only once.',
      'Your document will be reviewed before anything is added to your profile. Nothing is published automatically.',
    ],
  },
  document_received: {
    subject: 'We received your document',
    paragraphs: [
      'We have received your document and it is now in our secure review queue.',
      'You will be asked to confirm the extracted details before anything is added to your profile.',
    ],
  },
  document_rejected: {
    subject: 'Your document could not be accepted',
    paragraphs: [
      'Unfortunately your document could not be accepted (for example because of its format, size or an expired reference).',
      'You can start again from your profile and request a new reference at any time.',
    ],
  },
  document_needs_review: {
    subject: 'Your document is pending review',
    paragraphs: [
      'Your document is waiting for a manual review by our team. We will notify you as soon as it has been processed.',
    ],
  },
  data_ready_for_confirmation: {
    subject: 'Please confirm your document details',
    paragraphs: [
      'We have prepared the details of your document. Please review and confirm them in the app before they are added to your profile.',
      'Nothing is published without your explicit confirmation.',
    ],
    cta: 'Review and confirm',
  },
  reference_expired: {
    subject: 'Your document email reference has expired',
    paragraphs: [
      'The reference to send your document by email has expired. Request a new one from your profile whenever you are ready.',
    ],
  },
};

const es: Record<EmailIntakeTemplateKey, TemplateCopy> = {
  reference_created: {
    subject: 'Tu envío de documentos por correo — instrucciones',
    paragraphs: [
      'Has solicitado enviarnos un documento por correo. Envía tu archivo como adjunto a la dirección indicada en la app, manteniendo la referencia del asunto sin cambios.',
      'Formatos permitidos: PDF, PNG o JPG (máx. 10 MB). La referencia caduca en 72 horas y es de un solo uso.',
      'Tu documento será revisado antes de añadirse a tu perfil. Nada se publica automáticamente.',
    ],
  },
  document_received: {
    subject: 'Hemos recibido tu documento',
    paragraphs: [
      'Hemos recibido tu documento y está en nuestra cola segura de revisión.',
      'Te pediremos confirmar los datos extraídos antes de añadir nada a tu perfil.',
    ],
  },
  document_rejected: {
    subject: 'Tu documento no pudo aceptarse',
    paragraphs: [
      'Tu documento no pudo aceptarse (por ejemplo, por su formato, tamaño o una referencia caducada).',
      'Puedes volver a empezar desde tu perfil y solicitar una nueva referencia en cualquier momento.',
    ],
  },
  document_needs_review: {
    subject: 'Tu documento está pendiente de revisión',
    paragraphs: [
      'Tu documento está a la espera de una revisión manual por parte de nuestro equipo. Te avisaremos en cuanto se procese.',
    ],
  },
  data_ready_for_confirmation: {
    subject: 'Confirma los datos de tu documento',
    paragraphs: [
      'Hemos preparado los datos de tu documento. Revísalos y confírmalos en la app antes de que se añadan a tu perfil.',
      'Nada se publica sin tu confirmación explícita.',
    ],
    cta: 'Revisar y confirmar',
  },
  reference_expired: {
    subject: 'Tu referencia de envío por correo ha caducado',
    paragraphs: [
      'La referencia para enviar tu documento por correo ha caducado. Solicita una nueva desde tu perfil cuando quieras.',
    ],
  },
};

const de: Record<EmailIntakeTemplateKey, TemplateCopy> = {
  reference_created: {
    subject: 'Ihr Dokumentenversand per E-Mail — Anleitung',
    paragraphs: [
      'Sie möchten uns ein Dokument per E-Mail senden. Senden Sie Ihre Datei als Anhang an die in der App angezeigte Adresse und lassen Sie die Referenz in der Betreffzeile unverändert.',
      'Erlaubte Formate: PDF, PNG oder JPG (max. 10 MB). Die Referenz läuft nach 72 Stunden ab und ist nur einmal gültig.',
      'Ihr Dokument wird geprüft, bevor es Ihrem Profil hinzugefügt wird. Nichts wird automatisch veröffentlicht.',
    ],
  },
  document_received: {
    subject: 'Wir haben Ihr Dokument erhalten',
    paragraphs: [
      'Wir haben Ihr Dokument erhalten; es befindet sich in unserer sicheren Prüfwarteschlange.',
      'Sie werden gebeten, die extrahierten Angaben zu bestätigen, bevor etwas Ihrem Profil hinzugefügt wird.',
    ],
  },
  document_rejected: {
    subject: 'Ihr Dokument konnte nicht angenommen werden',
    paragraphs: [
      'Ihr Dokument konnte leider nicht angenommen werden (z. B. wegen Format, Größe oder einer abgelaufenen Referenz).',
      'Sie können jederzeit in Ihrem Profil neu beginnen und eine neue Referenz anfordern.',
    ],
  },
  document_needs_review: {
    subject: 'Ihr Dokument wartet auf Prüfung',
    paragraphs: [
      'Ihr Dokument wartet auf eine manuelle Prüfung durch unser Team. Wir benachrichtigen Sie, sobald es bearbeitet wurde.',
    ],
  },
  data_ready_for_confirmation: {
    subject: 'Bitte bestätigen Sie Ihre Dokumentendaten',
    paragraphs: [
      'Wir haben die Angaben zu Ihrem Dokument vorbereitet. Bitte prüfen und bestätigen Sie sie in der App, bevor sie Ihrem Profil hinzugefügt werden.',
      'Ohne Ihre ausdrückliche Bestätigung wird nichts veröffentlicht.',
    ],
    cta: 'Prüfen und bestätigen',
  },
  reference_expired: {
    subject: 'Ihre E-Mail-Referenz ist abgelaufen',
    paragraphs: [
      'Die Referenz für den Dokumentenversand per E-Mail ist abgelaufen. Fordern Sie in Ihrem Profil jederzeit eine neue an.',
    ],
  },
};

const fr: Record<EmailIntakeTemplateKey, TemplateCopy> = {
  reference_created: {
    subject: "Votre envoi de document par e-mail — instructions",
    paragraphs: [
      "Vous avez demandé à nous envoyer un document par e-mail. Envoyez votre fichier en pièce jointe à l'adresse indiquée dans l'app, en conservant la référence dans l'objet.",
      "Formats autorisés : PDF, PNG ou JPG (max 10 Mo). La référence expire dans 72 heures et n'est utilisable qu'une seule fois.",
      "Votre document sera vérifié avant d'être ajouté à votre profil. Rien n'est publié automatiquement.",
    ],
  },
  document_received: {
    subject: 'Nous avons bien reçu votre document',
    paragraphs: [
      "Nous avons reçu votre document ; il est dans notre file d'attente sécurisée de vérification.",
      "Nous vous demanderons de confirmer les informations extraites avant tout ajout à votre profil.",
    ],
  },
  document_rejected: {
    subject: "Votre document n'a pas pu être accepté",
    paragraphs: [
      "Votre document n'a pas pu être accepté (par exemple en raison de son format, de sa taille ou d'une référence expirée).",
      "Vous pouvez recommencer depuis votre profil et demander une nouvelle référence à tout moment.",
    ],
  },
  document_needs_review: {
    subject: 'Votre document est en attente de vérification',
    paragraphs: [
      "Votre document attend une vérification manuelle par notre équipe. Nous vous informerons dès qu'il aura été traité.",
    ],
  },
  data_ready_for_confirmation: {
    subject: 'Veuillez confirmer les informations de votre document',
    paragraphs: [
      "Nous avons préparé les informations de votre document. Veuillez les vérifier et les confirmer dans l'app avant qu'elles ne soient ajoutées à votre profil.",
      "Rien n'est publié sans votre confirmation explicite.",
    ],
    cta: 'Vérifier et confirmer',
  },
  reference_expired: {
    subject: "Votre référence d'envoi par e-mail a expiré",
    paragraphs: [
      "La référence pour envoyer votre document par e-mail a expiré. Demandez-en une nouvelle depuis votre profil quand vous le souhaitez.",
    ],
  },
};

const it: Record<EmailIntakeTemplateKey, TemplateCopy> = {
  reference_created: {
    subject: "Il tuo invio di documenti via e-mail — istruzioni",
    paragraphs: [
      "Hai chiesto di inviarci un documento via e-mail. Invia il file come allegato all'indirizzo mostrato nell'app, mantenendo invariato il riferimento nell'oggetto.",
      "Formati consentiti: PDF, PNG o JPG (max 10 MB). Il riferimento scade dopo 72 ore ed è monouso.",
      "Il documento sarà esaminato prima di essere aggiunto al profilo. Nulla viene pubblicato automaticamente.",
    ],
  },
  document_received: {
    subject: 'Abbiamo ricevuto il tuo documento',
    paragraphs: [
      "Abbiamo ricevuto il tuo documento; è nella nostra coda sicura di revisione.",
      "Ti chiederemo di confermare i dati estratti prima di aggiungere qualsiasi cosa al tuo profilo.",
    ],
  },
  document_rejected: {
    subject: 'Il tuo documento non è stato accettato',
    paragraphs: [
      "Purtroppo il tuo documento non è stato accettato (ad esempio per formato, dimensione o riferimento scaduto).",
      "Puoi ricominciare dal tuo profilo e richiedere un nuovo riferimento in qualsiasi momento.",
    ],
  },
  document_needs_review: {
    subject: 'Il tuo documento è in attesa di revisione',
    paragraphs: [
      "Il tuo documento è in attesa di una revisione manuale da parte del nostro team. Ti avviseremo non appena sarà elaborato.",
    ],
  },
  data_ready_for_confirmation: {
    subject: 'Conferma i dati del tuo documento',
    paragraphs: [
      "Abbiamo preparato i dati del tuo documento. Esaminali e confermali nell'app prima che vengano aggiunti al tuo profilo.",
      "Nulla viene pubblicato senza la tua conferma esplicita.",
    ],
    cta: 'Rivedi e conferma',
  },
  reference_expired: {
    subject: 'Il tuo riferimento e-mail è scaduto',
    paragraphs: [
      "Il riferimento per inviare il documento via e-mail è scaduto. Richiedine uno nuovo dal tuo profilo quando vuoi.",
    ],
  },
};

const nl: Record<EmailIntakeTemplateKey, TemplateCopy> = {
  reference_created: {
    subject: 'Uw document versturen per e-mail — instructies',
    paragraphs: [
      'U wilt ons een document per e-mail sturen. Stuur uw bestand als bijlage naar het adres in de app en laat de referentie in het onderwerp ongewijzigd.',
      'Toegestane formaten: PDF, PNG of JPG (max. 10 MB). De referentie verloopt na 72 uur en is eenmalig geldig.',
      'Uw document wordt gecontroleerd voordat het aan uw profiel wordt toegevoegd. Er wordt niets automatisch gepubliceerd.',
    ],
  },
  document_received: {
    subject: 'Wij hebben uw document ontvangen',
    paragraphs: [
      'Wij hebben uw document ontvangen; het staat in onze beveiligde controlewachtrij.',
      'Wij vragen u de geëxtraheerde gegevens te bevestigen voordat er iets aan uw profiel wordt toegevoegd.',
    ],
  },
  document_rejected: {
    subject: 'Uw document kon niet worden geaccepteerd',
    paragraphs: [
      'Uw document kon helaas niet worden geaccepteerd (bijvoorbeeld vanwege formaat, grootte of een verlopen referentie).',
      'U kunt opnieuw beginnen vanuit uw profiel en op elk moment een nieuwe referentie aanvragen.',
    ],
  },
  document_needs_review: {
    subject: 'Uw document wacht op controle',
    paragraphs: [
      'Uw document wacht op een handmatige controle door ons team. Wij laten het u weten zodra het is verwerkt.',
    ],
  },
  data_ready_for_confirmation: {
    subject: 'Bevestig de gegevens van uw document',
    paragraphs: [
      'Wij hebben de gegevens van uw document voorbereid. Controleer en bevestig ze in de app voordat ze aan uw profiel worden toegevoegd.',
      'Zonder uw uitdrukkelijke bevestiging wordt niets gepubliceerd.',
    ],
    cta: 'Controleren en bevestigen',
  },
  reference_expired: {
    subject: 'Uw e-mailreferentie is verlopen',
    paragraphs: [
      'De referentie om uw document per e-mail te versturen is verlopen. Vraag een nieuwe aan vanuit uw profiel wanneer u klaar bent.',
    ],
  },
};

const pl: Record<EmailIntakeTemplateKey, TemplateCopy> = {
  reference_created: {
    subject: 'Wysyłka dokumentu e-mailem — instrukcje',
    paragraphs: [
      'Poprosiłeś o wysłanie dokumentu e-mailem. Wyślij plik jako załącznik na adres podany w aplikacji, nie zmieniając referencji w temacie.',
      'Dozwolone formaty: PDF, PNG lub JPG (maks. 10 MB). Referencja wygasa po 72 godzinach i jest jednorazowa.',
      'Dokument zostanie sprawdzony, zanim trafi do Twojego profilu. Nic nie jest publikowane automatycznie.',
    ],
  },
  document_received: {
    subject: 'Otrzymaliśmy Twój dokument',
    paragraphs: [
      'Otrzymaliśmy Twój dokument; znajduje się w naszej bezpiecznej kolejce weryfikacji.',
      'Poprosimy Cię o potwierdzenie wyodrębnionych danych, zanim cokolwiek trafi do Twojego profilu.',
    ],
  },
  document_rejected: {
    subject: 'Nie można przyjąć Twojego dokumentu',
    paragraphs: [
      'Niestety nie można było przyjąć Twojego dokumentu (np. ze względu na format, rozmiar lub wygasłą referencję).',
      'Możesz zacząć od nowa w swoim profilu i w dowolnym momencie poprosić o nową referencję.',
    ],
  },
  document_needs_review: {
    subject: 'Twój dokument oczekuje na weryfikację',
    paragraphs: [
      'Twój dokument czeka na ręczną weryfikację przez nasz zespół. Powiadomimy Cię, gdy tylko zostanie przetworzony.',
    ],
  },
  data_ready_for_confirmation: {
    subject: 'Potwierdź dane swojego dokumentu',
    paragraphs: [
      'Przygotowaliśmy dane Twojego dokumentu. Sprawdź je i potwierdź w aplikacji, zanim zostaną dodane do Twojego profilu.',
      'Nic nie jest publikowane bez Twojego wyraźnego potwierdzenia.',
    ],
    cta: 'Sprawdź i potwierdź',
  },
  reference_expired: {
    subject: 'Twoja referencja e-mail wygasła',
    paragraphs: [
      'Referencja do wysłania dokumentu e-mailem wygasła. Poproś o nową w swoim profilu, gdy będziesz gotowy.',
    ],
  },
};

const pt: Record<EmailIntakeTemplateKey, TemplateCopy> = {
  reference_created: {
    subject: 'O seu envio de documento por e-mail — instruções',
    paragraphs: [
      'Pediu para nos enviar um documento por e-mail. Envie o ficheiro como anexo para o endereço indicado na app, mantendo a referência no assunto sem alterações.',
      'Formatos permitidos: PDF, PNG ou JPG (máx. 10 MB). A referência expira em 72 horas e só pode ser usada uma vez.',
      'O seu documento será revisto antes de ser adicionado ao seu perfil. Nada é publicado automaticamente.',
    ],
  },
  document_received: {
    subject: 'Recebemos o seu documento',
    paragraphs: [
      'Recebemos o seu documento; está na nossa fila segura de revisão.',
      'Vamos pedir-lhe que confirme os dados extraídos antes de adicionar seja o que for ao seu perfil.',
    ],
  },
  document_rejected: {
    subject: 'O seu documento não pôde ser aceite',
    paragraphs: [
      'Infelizmente o seu documento não pôde ser aceite (por exemplo, devido ao formato, tamanho ou uma referência expirada).',
      'Pode recomeçar a partir do seu perfil e pedir uma nova referência a qualquer momento.',
    ],
  },
  document_needs_review: {
    subject: 'O seu documento está pendente de revisão',
    paragraphs: [
      'O seu documento aguarda uma revisão manual da nossa equipa. Avisaremos assim que for processado.',
    ],
  },
  data_ready_for_confirmation: {
    subject: 'Confirme os dados do seu documento',
    paragraphs: [
      'Preparámos os dados do seu documento. Reveja e confirme-os na app antes de serem adicionados ao seu perfil.',
      'Nada é publicado sem a sua confirmação explícita.',
    ],
    cta: 'Rever e confirmar',
  },
  reference_expired: {
    subject: 'A sua referência de envio por e-mail expirou',
    paragraphs: [
      'A referência para enviar o seu documento por e-mail expirou. Peça uma nova no seu perfil quando estiver pronto.',
    ],
  },
};

const ro: Record<EmailIntakeTemplateKey, TemplateCopy> = {
  reference_created: {
    subject: 'Trimiterea documentului prin e-mail — instrucțiuni',
    paragraphs: [
      'Ați solicitat să ne trimiteți un document prin e-mail. Trimiteți fișierul ca atașament la adresa afișată în aplicație, păstrând neschimbată referința din subiect.',
      'Formate permise: PDF, PNG sau JPG (max. 10 MB). Referința expiră în 72 de ore și poate fi folosită o singură dată.',
      'Documentul va fi verificat înainte de a fi adăugat în profil. Nimic nu se publică automat.',
    ],
  },
  document_received: {
    subject: 'Am primit documentul dumneavoastră',
    paragraphs: [
      'Am primit documentul dumneavoastră; se află în coada noastră securizată de verificare.',
      'Vă vom cere să confirmați datele extrase înainte ca ceva să fie adăugat în profil.',
    ],
  },
  document_rejected: {
    subject: 'Documentul dumneavoastră nu a putut fi acceptat',
    paragraphs: [
      'Din păcate, documentul dumneavoastră nu a putut fi acceptat (de exemplu, din cauza formatului, dimensiunii sau a unei referințe expirate).',
      'Puteți reîncepe din profil și solicita o nouă referință oricând.',
    ],
  },
  document_needs_review: {
    subject: 'Documentul dumneavoastră așteaptă verificarea',
    paragraphs: [
      'Documentul dumneavoastră așteaptă o verificare manuală din partea echipei noastre. Vă vom anunța imediat ce este procesat.',
    ],
  },
  data_ready_for_confirmation: {
    subject: 'Vă rugăm să confirmați datele documentului',
    paragraphs: [
      'Am pregătit datele documentului dumneavoastră. Verificați-le și confirmați-le în aplicație înainte de a fi adăugate în profil.',
      'Nimic nu se publică fără confirmarea dumneavoastră explicită.',
    ],
    cta: 'Verificați și confirmați',
  },
  reference_expired: {
    subject: 'Referința dumneavoastră de e-mail a expirat',
    paragraphs: [
      'Referința pentru trimiterea documentului prin e-mail a expirat. Solicitați una nouă din profil când sunteți gata.',
    ],
  },
};

const bg: Record<EmailIntakeTemplateKey, TemplateCopy> = {
  reference_created: {
    subject: 'Изпращане на документ по имейл — инструкции',
    paragraphs: [
      'Поискахте да ни изпратите документ по имейл. Изпратете файла като прикачен файл на адреса, показан в приложението, като запазите референцията в темата непроменена.',
      'Разрешени формати: PDF, PNG или JPG (макс. 10 MB). Референцията изтича след 72 часа и е за еднократна употреба.',
      'Документът ще бъде прегледан, преди да бъде добавен към профила ви. Нищо не се публикува автоматично.',
    ],
  },
  document_received: {
    subject: 'Получихме вашия документ',
    paragraphs: [
      'Получихме вашия документ; той е в нашата защитена опашка за проверка.',
      'Ще ви помолим да потвърдите извлечените данни, преди нещо да бъде добавено към профила ви.',
    ],
  },
  document_rejected: {
    subject: 'Вашият документ не можа да бъде приет',
    paragraphs: [
      'За съжаление вашият документ не можа да бъде приет (например поради формат, размер или изтекла референция).',
      'Можете да започнете отново от профила си и да заявите нова референция по всяко време.',
    ],
  },
  document_needs_review: {
    subject: 'Вашият документ чака проверка',
    paragraphs: [
      'Вашият документ чака ръчна проверка от нашия екип. Ще ви уведомим веднага щом бъде обработен.',
    ],
  },
  data_ready_for_confirmation: {
    subject: 'Моля, потвърдете данните на вашия документ',
    paragraphs: [
      'Подготвихме данните на вашия документ. Прегледайте ги и ги потвърдете в приложението, преди да бъдат добавени към профила ви.',
      'Нищо не се публикува без вашето изрично потвърждение.',
    ],
    cta: 'Преглед и потвърждение',
  },
  reference_expired: {
    subject: 'Вашата имейл референция изтече',
    paragraphs: [
      'Референцията за изпращане на документ по имейл изтече. Заявете нова от профила си, когато сте готови.',
    ],
  },
};

const uk: Record<EmailIntakeTemplateKey, TemplateCopy> = {
  reference_created: {
    subject: 'Надсилання документа електронною поштою — інструкції',
    paragraphs: [
      'Ви попросили надіслати нам документ електронною поштою. Надішліть файл вкладенням на адресу, вказану в застосунку, не змінюючи референцію в темі листа.',
      'Дозволені формати: PDF, PNG або JPG (макс. 10 МБ). Референція дійсна 72 години та лише для одного використання.',
      'Документ буде перевірено, перш ніж його буде додано до вашого профілю. Нічого не публікується автоматично.',
    ],
  },
  document_received: {
    subject: 'Ми отримали ваш документ',
    paragraphs: [
      'Ми отримали ваш документ; він перебуває в нашій захищеній черзі на перевірку.',
      'Ми попросимо вас підтвердити витягнуті дані, перш ніж щось буде додано до вашого профілю.',
    ],
  },
  document_rejected: {
    subject: 'Ваш документ не вдалося прийняти',
    paragraphs: [
      'На жаль, ваш документ не вдалося прийняти (наприклад, через формат, розмір або прострочену референцію).',
      'Ви можете почати знову зі свого профілю та будь-коли запросити нову референцію.',
    ],
  },
  document_needs_review: {
    subject: 'Ваш документ очікує на перевірку',
    paragraphs: [
      'Ваш документ очікує на ручну перевірку нашою командою. Ми повідомимо вас, щойно його буде опрацьовано.',
    ],
  },
  data_ready_for_confirmation: {
    subject: 'Підтвердьте дані вашого документа',
    paragraphs: [
      'Ми підготували дані вашого документа. Перегляньте та підтвердьте їх у застосунку, перш ніж їх буде додано до профілю.',
      'Нічого не публікується без вашого явного підтвердження.',
    ],
    cta: 'Переглянути й підтвердити',
  },
  reference_expired: {
    subject: 'Термін дії вашої референції минув',
    paragraphs: [
      'Референція для надсилання документа електронною поштою втратила чинність. Запросіть нову у своєму профілі, коли будете готові.',
    ],
  },
};

const CATALOG: Catalog = {
  reference_created: { bg: bg.reference_created, de: de.reference_created, en: en.reference_created, es: es.reference_created, fr: fr.reference_created, it: it.reference_created, nl: nl.reference_created, pl: pl.reference_created, pt: pt.reference_created, ro: ro.reference_created, uk: uk.reference_created },
  document_received: { bg: bg.document_received, de: de.document_received, en: en.document_received, es: es.document_received, fr: fr.document_received, it: it.document_received, nl: nl.document_received, pl: pl.document_received, pt: pt.document_received, ro: ro.document_received, uk: uk.document_received },
  document_rejected: { bg: bg.document_rejected, de: de.document_rejected, en: en.document_rejected, es: es.document_rejected, fr: fr.document_rejected, it: it.document_rejected, nl: nl.document_rejected, pl: pl.document_rejected, pt: pt.document_rejected, ro: ro.document_rejected, uk: uk.document_rejected },
  document_needs_review: { bg: bg.document_needs_review, de: de.document_needs_review, en: en.document_needs_review, es: es.document_needs_review, fr: fr.document_needs_review, it: it.document_needs_review, nl: nl.document_needs_review, pl: pl.document_needs_review, pt: pt.document_needs_review, ro: ro.document_needs_review, uk: uk.document_needs_review },
  data_ready_for_confirmation: { bg: bg.data_ready_for_confirmation, de: de.data_ready_for_confirmation, en: en.data_ready_for_confirmation, es: es.data_ready_for_confirmation, fr: fr.data_ready_for_confirmation, it: it.data_ready_for_confirmation, nl: nl.data_ready_for_confirmation, pl: pl.data_ready_for_confirmation, pt: pt.data_ready_for_confirmation, ro: ro.data_ready_for_confirmation, uk: uk.data_ready_for_confirmation },
  reference_expired: { bg: bg.reference_expired, de: de.reference_expired, en: en.reference_expired, es: es.reference_expired, fr: fr.reference_expired, it: it.reference_expired, nl: nl.reference_expired, pl: pl.reference_expired, pt: pt.reference_expired, ro: ro.reference_expired, uk: uk.reference_expired },
};

/**
 * Renderiza una plantilla. `testMode` añade el prefijo [TEST] al asunto
 * (obligatorio durante la fase TEST; los destinatarios de TEST están fijados
 * por configuración de envío, no aquí).
 */
export function renderEmailIntakeTemplate(
  key: EmailIntakeTemplateKey,
  locale: string,
  options: { testMode: boolean } = { testMode: true },
): RenderedTemplate {
  const loc: EmailIntakeLocale = (EMAIL_INTAKE_LOCALES as readonly string[]).includes(locale)
    ? (locale as EmailIntakeLocale)
    : 'en';
  const copy = CATALOG[key][loc];
  return {
    subject: `${options.testMode ? TEST_PREFIX : ''}${copy.subject}`,
    text: copy.paragraphs.join('\n\n'),
    html: htmlShell(copy),
  };
}
