// No React here: the picker injected into the page imports it too.
import { storage } from "#imports";

export const locales = ["en", "pt-br"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

export const localeConfig = {
  en: { htmlLang: "en", intl: "en-US", label: "EN", name: "English" },
  "pt-br": { htmlLang: "pt-BR", intl: "pt-BR", label: "PT", name: "Português" },
} as const satisfies Record<Locale, unknown>;

export function isLocale(value: unknown): value is Locale {
  return (locales as readonly unknown[]).includes(value);
}

export function otherLocale(locale: Locale): Locale {
  return locale === "en" ? "pt-br" : "en";
}

// Extension storage instead of a URL or localStorage: shared by the side panel
// and the page script, and watchable, so switching updates both live
export const localeItem = storage.defineItem<Locale>("local:locale", {
  fallback: defaultLocale,
});

export async function getLocale() {
  const locale = await localeItem.getValue();
  return isLocale(locale) ? locale : defaultLocale;
}

// The API's ids are language codes; "pt" is Brazilian Portuguese
const languageTags: Record<string, string> = { pt: "pt-BR" };

/**
 * The language's name as it reads mid-sentence: "inglês", "português (Brasil)"
 * in Portuguese, "English" in English (languageLabel capitalizes for labels)
 */
export function languageName(locale: Locale, id: string) {
  try {
    return (
      new Intl.DisplayNames([localeConfig[locale].intl], {
        type: "language",
      }).of(languageTags[id] ?? id) ?? id
    );
  } catch {
    return id;
  }
}

/**
 * "Português (Brasil)", "English": the language's name in the UI language,
 * from the browser, so new languages from the API need no translations here
 */
export function languageLabel(locale: Locale, id: string) {
  try {
    const intl = localeConfig[locale].intl;
    const name = new Intl.DisplayNames([intl], { type: "language" }).of(
      languageTags[id] ?? id,
    );
    if (!name) return id;
    return name.charAt(0).toLocaleUpperCase(intl) + name.slice(1);
  } catch {
    return id;
  }
}

/** "A, B and C" / "A, B e C" */
export function formatList(locale: Locale, items: string[]) {
  return new Intl.ListFormat(localeConfig[locale].intl, {
    type: "conjunction",
  }).format(items);
}

/** A typographic minus ("−1.000"), not a hyphen: a balance can go negative */
export function formatNumber(locale: Locale, value: number) {
  return new Intl.NumberFormat(localeConfig[locale].intl)
    .format(value)
    .replace("-", "\u2212");
}

/** "14:32" today, "15 Oct" this year, "15 Oct 2025" before */
export function formatDate(locale: Locale, iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const intl = localeConfig[locale].intl;
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString(intl, {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return date.toLocaleDateString(intl, {
    day: "numeric",
    month: "short",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}

/** "1 credit", "1.000 créditos" */
export function formatCredits(locale: Locale, credits: number) {
  return getDictionary(locale).credits.count(
    credits,
    formatNumber(locale, credits),
  );
}

export function hostname(url: string | null) {
  return url && URL.canParse(url) ? new URL(url).hostname : "";
}

const en = {
  brand: "summarizer",
  themeToggle: "Toggle dark mode",
  darkTheme: "Dark theme",
  lightTheme: "Light theme",
  languageSwitch: "Use in English",

  heroTitle: "Summarize what matters.",
  heroBody:
    "Pick the part of the page you care about and skip the menus, ads and comments. Less noise in, a better summary out.",
  selectContent: "Select content",
  wholePage: "Use the whole page",

  pdf: {
    body: "This tab is a PDF. Read its text, then summarize every page or just one.",
    read: "Read PDF",
    reading: "Reading PDF…",
    progress: (page: string, total: string) => `Page ${page} of ${total}`,
    label: "PDF",
    pages: "Pages",
    allPages: (count: string) => `All pages (${count})`,
    page: (number: string) => `Page ${number}`,
    pageCount: (count: number, formatted: string) =>
      `${formatted} ${count === 1 ? "page" : "pages"}`,
    longHint: "Too long to send whole: pick a single page, or the end is cut.",
    emptyPage: "This page has no text. Pick another one.",
  },

  pageInfo: {
    label: "This page",
    untitled: "Untitled page",
    words: (count: number, formatted: string) =>
      `${formatted} ${count === 1 ? "word" : "words"}`,
    readingTime: (minutes: string) => `${minutes} min read`,
  },

  translate: {
    incomplete: (language: string) =>
      `The ${language} translation stopped partway through and wasn't saved. The credits stay charged.`,
    languages: "Language",
    translatedTo: (languages: string) => `Translated to ${languages}`,
    writtenIn: (language: string) => `Written in ${language}`,
    original: (language: string) => `Original · ${language}`,
    translate: "Translate",
    target: "Translate to",
    open: (language: string) => `View in ${language}`,
    failed: "Couldn't translate it.",
    priceChanged: (price: string) =>
      `The price changed to ${price}. Nothing was charged: translate again to confirm.`,
    interrupted:
      "The connection dropped. The translation keeps being written and will show up here.",
  },

  pickingTitle: "Click an element on the page",
  pickingHint: "Hover to highlight, then click to select.",
  commands: {
    parent: "parent",
    child: "child",
    select: "select",
    cancel: "cancel",
  },

  selection: "Selection",
  wholePageLabel: "whole page",
  tokens: (count: string) => `~${count} tokens`,
  truncated: "Long content was trimmed to fit.",
  summarize: "Summarize",
  reselect: "Select again",
  back: "Back",
  cancel: "Cancel",
  close: "Close",
  tryAgain: "Try again",

  loading: "Loading",
  summarizing: "Summarizing…",
  summary: "Summary",
  thinking: "Thinking…",
  thinkingFor: (seconds: number) => `Thinking… ${seconds}s`,
  writing: "Writing…",
  copy: "Copy",
  export: "Export",
  exportSource: "Source",
  copied: "Copied",

  errors: {
    noAccess: {
      title: "Access needed",
      body: "Allow the extension to read pages so it can see what you select. It only reads a page when you ask.",
      action: "Allow access",
    },
    restricted: {
      title: "This page can't be read",
      body: "Browser pages and the extension store are off limits to extensions. Try it on a regular website.",
    },
    empty: {
      title: "Nothing to summarize",
      body: "That element has no readable text. Try selecting a larger area.",
    },
    unknown: { title: "Something went wrong" },
    fileAccess: {
      title: "Local files are off",
      body: 'To read files opened from your computer, turn on "Allow access to file URLs" in the extension\'s details (chrome://extensions).',
    },
    pdfProtected: {
      title: "This PDF is password-protected",
      body: "Open it without a password (or save an unlocked copy) and try again.",
    },
    pdfInvalid: {
      title: "This PDF can't be read",
      body: "The file seems damaged or isn't really a PDF.",
    },
    pdfNoText: {
      title: "This PDF has no text",
      body: "It's probably scanned: its pages are images, with no text to summarize.",
    },
    pdfTooLarge: {
      title: "This PDF is too large",
      body: "Files up to 30 MB can be read.",
    },
    pdfUnreadable: {
      title: "Couldn't download this PDF",
      body: "Reload the tab and try again.",
    },
  },

  summaryErrors: {
    offline: {
      title: "Can't reach the server",
      body: (url: string) =>
        `Check that ai-summarizer-api is running at ${url}.`,
    },
    unavailable: {
      title: "The AI is unavailable",
      body: "The summarizer failed or isn't configured. Try again in a moment.",
    },
    timeout: {
      title: "The summary took too long",
      body: "Try again, or select a smaller part of the page.",
    },
    invalid: {
      title: "The server rejected this content",
      body: "Try selecting a different part of the page.",
    },
    interrupted: {
      title: "The connection dropped",
      body: "The summary keeps being written and will show up in your history.",
    },
  },

  summaryIncomplete: {
    title: "The summary is incomplete",
    body: "It stopped partway through, so it wasn't saved to your history. The credits stay charged.",
    backToSelection: "Back to the selection",
  },

  signIn: {
    body: "Sign in to start summarizing.",
    google: "Continue with Google",
    errors: {
      "not-configured": "Google sign-in isn't set up yet.",
      rejected: "Google didn't confirm this account. Try again.",
      offline: (url: string) => `Can't reach the server at ${url}.`,
      failed: "Couldn't sign in. Try again.",
      "email-linked":
        "This email is already linked to another account. Sign in with the original Google account or contact support.",
    },
  },
  account: {
    menu: "Account",
    signOut: "Sign out",
    signOutAll: "Sign out of all devices",
    signOutAllTitle: "Sign out of all devices?",
    signOutAllBody:
      "Every session of this account ends, this one included. You'll need to sign in again everywhere.",
    signOutAllConfirm: "Sign out everywhere",
    signOutAllError: "Couldn't sign out of all devices. Try again.",
  },

  nav: {
    label: "Main",
    summarize: "summarize",
    history: "history",
    credits: "credits",
  },
  buy: {
    title: "Buy credits",
    open: "Buy credits",
    intro:
      "Pay by PIX: the credits arrive as soon as the payment is confirmed.",
    perHundred: (price: string) => `${price} per 100 credits`,
    /** "+100 bonus (+10%)": the percent is of what's paid for */
    bonus: (credits: string, percent: string) =>
      `+${credits} bonus (+${percent})`,
    noBonus: "No bonus",
    recommended: "Best value",
    /** "1,000 + 100 bonus" */
    bonusBreakdown: (credits: string, bonus: string) =>
      `${credits} + ${bonus} bonus`,
    buy: "Buy",
    unavailable: "Purchases are unavailable at the moment.",
    loadError: "Couldn't load the packs.",
    packChanged: "That pack is no longer available. Pick one again.",
    providerDown: "The payment service didn't answer. Try again.",
    notConfigured: "Payments aren't available right now.",
    failedToStart: "Couldn't create the PIX.",
    sandbox: "Sandbox",
    qrAlt: (amount: string) => `PIX QR code to pay ${amount}`,
    copyCode: "Copy PIX code",
    copied: "Copied",
    steps:
      "Open your bank's app, choose PIX and scan the QR code, or paste the code.",
    waiting: "Waiting for the payment…",
    expiresIn: (time: string) => `Expires in ${time}`,
    simulate: "Simulate payment",
    simulateError: "Couldn't simulate the payment.",
    otherPack: "Other packs",
    paidTitle: "Payment confirmed!",
    paidCredits: (credits: string) => `+${credits}`,
    newBalance: (balance: string) => `Your balance is now ${balance}.`,
    done: "Done",
    expiredTitle: "The PIX expired",
    expiredBody: "Nothing was charged. Generate a new one to pay.",
    newPix: "Generate new PIX",
    failedTitle: "The payment didn't go through",
    failedBody: "Nothing was charged.",
    refundedTitle: "Purchase refunded",
    disputedTitle: "Purchase disputed",
    reversedBody:
      "This PIX was reversed at the bank, so its credits were taken back from your balance.",
    tooManyPending:
      "You already have open PIX charges. Pay one of them or wait for it to expire.",
  },
  options: {
    title: "Options",
    model: "Model",
    language: "Summary language",
    style: "Style",
    length: "Length",
    effort: "Effort",
    instructions: "Preferences",
    instructionsPlaceholder: "e.g. focus on the numbers",
    styles: {
      summary: { label: "Summary", hint: "intro + key points" },
      bullets: { label: "Bullet points", hint: "" },
      detailed: { label: "Detailed", hint: "sections covering everything" },
      simple: { label: "Simple", hint: "plain language" },
      study: { label: "Study notes", hint: "concepts + review questions" },
    } as Record<string, { label: string; hint: string }>,
    lengths: { short: "Short", medium: "Medium", long: "Long" } as Record<
      string,
      string
    >,
    /** Short: history and summary meta lines */
    efforts: { low: "Fast", medium: "Balanced", high: "Thorough" } as Record<
      string,
      string
    >,
    /** In the effort selector */
    effortChoices: {
      low: "Fast",
      medium: "Balanced",
      high: "Thorough (slower)",
    } as Record<string, string>,
    effortHighHint: (models: string) =>
      models
        ? `Slower and pricier, especially with ${models}.`
        : "Slower and pricier.",
    invalidChoice: "Choose one of the options.",
    instructionsTooLong: (max: string) => `Up to ${max} characters.`,
  },
  credits: {
    title: "Credits",
    count: (n: number, formatted: string) =>
      `${formatted} ${Math.abs(n) === 1 ? "credit" : "credits"}`,
    /** The unit alone, for "▭ credits" while the number loads */
    unit: "credits",
    balance: "Balance",
    about:
      "The price depends on how much text you pick, the model, the effort, the style and the length; it's shown before you summarize.",
    statement: "Statement",
    kinds: {
      signup_bonus: "Welcome bonus",
      summary: "Summary",
      refund: "Refund",
      adjustment: "Adjustment",
      translation: "Translation",
      purchase: "Credit purchase",
      purchase_reversal: "Purchase reversed",
    } as Record<string, string>,
    deletedSummary: "deleted summary",
    balanceAfter: (formatted: string) => `balance ${formatted}`,
    emptyTitle: "No transactions yet",
    loadError: "Couldn't load your statement.",
    quoteError: "Couldn't get the price.",
    insufficientTitle: "Not enough credits",
    insufficient: (price: string, balance: string) =>
      `This summary costs ${price} and your balance is ${balance}. A cheaper model, effort or length may fit, or buy more credits.`,
    priceChanged: (price: string) =>
      `The price changed to ${price}. Nothing was charged: summarize again to confirm.`,
    refunded: "Your credits were returned.",
    negativeTitle: "Your balance is negative",
    negativeBody:
      "Credits from a purchase that was refunded or disputed were taken back. Buy credits to summarize and translate again.",
  },
  history: {
    title: "History",
    emptyTitle: "No summaries yet",
    emptyBody: "Everything you summarize is saved here.",
    loadError: "Couldn't load your history.",
    loadingMore: "Loading more…",
    back: "History",
    notFound: "This summary no longer exists.",
    loadSummaryError: "Couldn't load this summary.",
    search: "Search summaries",
    types: {
      webpage: "Page",
      selection: "Selection",
      pdf: "PDF",
      text: "Text file",
    } as Record<string, string>,
    filters: "Filters",
    type: "Type",
    allTypes: "All",
    site: "Site",
    period: "Period",
    any: "Any",
    periods: {
      all: "Any time",
      "7d": "Last 7 days",
      "30d": "Last 30 days",
      custom: "Custom",
    },
    from: "From",
    to: "To",
    noResultsTitle: "No summaries found",
    noResultsBody: "Try other words or fewer filters.",
    clearFilters: "Clear filters",
    delete: "Delete",
    deleteTitle: "Delete this summary?",
    deleteBody: "It will be removed from your history. This can't be undone.",
    deleteError: "Couldn't delete it. Try again.",
    deleteTranslationTitle: (language: string) =>
      `Delete the ${language} translation?`,
    deleteOriginalTitle: (language: string) =>
      `Delete the ${language} version?`,
    deleteOriginalBody: (next: string) =>
      `The summary stays in your history, now in ${next}. Other translations stay. Credits aren't refunded.`,
    deleteOriginal: "Delete this version",
    deleteEverything: "Delete everything",
    deleteTranslationBody:
      "Only this translation goes: the original summary and other translations stay. Credits aren't refunded.",
  },

  pickerHint: "click to select · ↑ parent · ↓ child · esc cancel",
};

export type Dictionary = typeof en;

const ptBr: Dictionary = {
  brand: "summarizer",
  themeToggle: "Alternar modo escuro",
  darkTheme: "Tema escuro",
  lightTheme: "Tema claro",
  languageSwitch: "Usar em português",

  heroTitle: "Resuma o que importa.",
  heroBody:
    "Selecione a parte da página que te interessa e deixe de fora menus, anúncios e comentários. Menos ruído na entrada, um resumo melhor na saída.",
  selectContent: "Selecionar conteúdo",
  wholePage: "Usar a página inteira",

  pdf: {
    body: "Esta aba é um PDF. Leia o texto dele e resuma todas as páginas ou só uma.",
    read: "Ler PDF",
    reading: "Lendo PDF…",
    progress: (page, total) => `Página ${page} de ${total}`,
    label: "PDF",
    pages: "Páginas",
    allPages: (count) => `Todas as páginas (${count})`,
    page: (number) => `Página ${number}`,
    pageCount: (count, formatted) =>
      `${formatted} ${count === 1 ? "página" : "páginas"}`,
    longHint:
      "Longo demais para ir inteiro: escolha uma página, ou o final é cortado.",
    emptyPage: "Esta página não tem texto. Escolha outra.",
  },

  pageInfo: {
    label: "Esta página",
    untitled: "Página sem título",
    words: (count, formatted) =>
      `${formatted} ${count === 1 ? "palavra" : "palavras"}`,
    readingTime: (minutes) => `${minutes} min de leitura`,
  },

  translate: {
    incomplete: (language) =>
      `A tradução para ${language} parou no meio e não foi salva. Os créditos continuam cobrados.`,
    languages: "Idioma",
    translatedTo: (languages) => `Traduzido para ${languages}`,
    writtenIn: (language) => `Escrito em ${language}`,
    original: (language) => `Original · ${language}`,
    translate: "Traduzir",
    target: "Traduzir para",
    open: (language) => `Ver em ${language}`,
    failed: "Não foi possível traduzir.",
    priceChanged: (price) =>
      `O preço mudou para ${price}. Nada foi cobrado: traduza de novo para confirmar.`,
    interrupted:
      "A conexão caiu. A tradução continua sendo escrita e vai aparecer aqui.",
  },

  pickingTitle: "Clique em um elemento da página",
  pickingHint: "Passe o mouse para destacar e clique para selecionar.",
  commands: {
    parent: "pai",
    child: "filho",
    select: "selecionar",
    cancel: "cancelar",
  },

  selection: "Seleção",
  wholePageLabel: "página inteira",
  tokens: (count) => `~${count} tokens`,
  truncated: "O conteúdo era longo e foi cortado.",
  summarize: "Resumir",
  reselect: "Selecionar de novo",
  back: "Voltar",
  cancel: "Cancelar",
  close: "Fechar",
  tryAgain: "Tentar de novo",

  loading: "Carregando",
  summarizing: "Resumindo…",
  summary: "Resumo",
  thinking: "Pensando…",
  thinkingFor: (seconds) => `Pensando… ${seconds}s`,
  writing: "Escrevendo…",
  copy: "Copiar",
  export: "Exportar",
  exportSource: "Fonte",
  copied: "Copiado",

  errors: {
    noAccess: {
      title: "Acesso necessário",
      body: "Permita que a extensão leia páginas para ver o que você seleciona. Ela só lê uma página quando você pede.",
      action: "Permitir acesso",
    },
    restricted: {
      title: "Esta página não pode ser lida",
      body: "Páginas internas do navegador e a loja de extensões são bloqueadas para extensões. Tente em um site comum.",
    },
    empty: {
      title: "Nada para resumir",
      body: "Esse elemento não tem texto legível. Tente selecionar uma área maior.",
    },
    unknown: { title: "Algo deu errado" },
    fileAccess: {
      title: "Arquivos locais desativados",
      body: 'Para ler arquivos abertos do seu computador, ative "Permitir acesso a URLs de arquivo" nos detalhes da extensão (chrome://extensions).',
    },
    pdfProtected: {
      title: "Este PDF tem senha",
      body: "Abra-o sem senha (ou salve uma cópia desbloqueada) e tente de novo.",
    },
    pdfInvalid: {
      title: "Este PDF não pode ser lido",
      body: "O arquivo parece corrompido ou não é um PDF de verdade.",
    },
    pdfNoText: {
      title: "Este PDF não tem texto",
      body: "Provavelmente é digitalizado: as páginas são imagens, sem texto para resumir.",
    },
    pdfTooLarge: {
      title: "Este PDF é grande demais",
      body: "Arquivos de até 30 MB podem ser lidos.",
    },
    pdfUnreadable: {
      title: "Não foi possível baixar este PDF",
      body: "Recarregue a aba e tente de novo.",
    },
  },

  summaryErrors: {
    offline: {
      title: "Não foi possível conectar ao servidor",
      body: (url) => `Verifique se a ai-summarizer-api está rodando em ${url}.`,
    },
    unavailable: {
      title: "A IA está indisponível",
      body: "O resumo falhou ou não está configurado. Tente de novo em instantes.",
    },
    timeout: {
      title: "O resumo demorou demais",
      body: "Tente de novo ou selecione uma parte menor da página.",
    },
    invalid: {
      title: "O servidor recusou este conteúdo",
      body: "Tente selecionar outra parte da página.",
    },
    interrupted: {
      title: "A conexão caiu",
      body: "O resumo continua sendo escrito e vai aparecer no seu histórico.",
    },
  },

  summaryIncomplete: {
    title: "O resumo ficou incompleto",
    body: "Ele parou no meio, por isso não foi salvo no seu histórico. Os créditos continuam cobrados.",
    backToSelection: "Voltar à seleção",
  },

  signIn: {
    body: "Entre para começar a resumir.",
    google: "Continuar com o Google",
    errors: {
      "not-configured": "O login com o Google ainda não está configurado.",
      rejected: "O Google não confirmou esta conta. Tente de novo.",
      offline: (url) => `Não foi possível conectar ao servidor em ${url}.`,
      failed: "Não foi possível entrar. Tente de novo.",
      "email-linked":
        "Este e-mail já está vinculado a outra conta. Entre com a conta Google original ou fale com o suporte.",
    },
  },
  account: {
    menu: "Conta",
    signOut: "Sair",
    signOutAll: "Sair de todos os dispositivos",
    signOutAllTitle: "Sair de todos os dispositivos?",
    signOutAllBody:
      "Todas as sessões desta conta terminam, inclusive esta. Você vai precisar entrar de novo em todos os lugares.",
    signOutAllConfirm: "Sair de todos",
    signOutAllError:
      "Não foi possível sair de todos os dispositivos. Tente de novo.",
  },

  nav: {
    label: "Principal",
    summarize: "resumir",
    history: "histórico",
    credits: "créditos",
  },
  buy: {
    title: "Comprar créditos",
    open: "Comprar créditos",
    intro:
      "Pague com PIX: os créditos entram assim que o pagamento é confirmado.",
    perHundred: (price) => `${price} a cada 100 créditos`,
    bonus: (credits, percent) => `+${credits} de bônus (+${percent})`,
    noBonus: "Sem bônus",
    recommended: "Melhor custo",
    bonusBreakdown: (credits, bonus) => `${credits} + ${bonus} de bônus`,
    buy: "Comprar",
    unavailable: "Compras indisponíveis no momento.",
    loadError: "Não foi possível carregar os pacotes.",
    packChanged: "Esse pacote não está mais disponível. Escolha de novo.",
    providerDown: "O serviço de pagamento não respondeu. Tente de novo.",
    notConfigured: "Os pagamentos não estão disponíveis agora.",
    failedToStart: "Não foi possível gerar o PIX.",
    sandbox: "Sandbox",
    qrAlt: (amount) => `QR code PIX para pagar ${amount}`,
    copyCode: "Copiar código PIX",
    copied: "Copiado",
    steps:
      "Abra o app do seu banco, escolha PIX e leia o QR code, ou cole o código.",
    waiting: "Aguardando o pagamento…",
    expiresIn: (time) => `Expira em ${time}`,
    simulate: "Simular pagamento",
    simulateError: "Não foi possível simular o pagamento.",
    otherPack: "Outros pacotes",
    paidTitle: "Pagamento confirmado!",
    paidCredits: (credits) => `+${credits}`,
    newBalance: (balance) => `Seu saldo agora é ${balance}.`,
    done: "Concluir",
    expiredTitle: "O PIX expirou",
    expiredBody: "Nada foi cobrado. Gere um novo para pagar.",
    newPix: "Gerar novo PIX",
    failedTitle: "O pagamento não foi concluído",
    failedBody: "Nada foi cobrado.",
    refundedTitle: "Compra reembolsada",
    disputedTitle: "Compra contestada",
    reversedBody:
      "Este PIX foi revertido no banco, por isso os créditos dele foram retirados do seu saldo.",
    tooManyPending:
      "Você já tem PIX em aberto. Pague um deles ou espere expirar.",
  },
  options: {
    title: "Opções",
    model: "Modelo",
    language: "Idioma do resumo",
    style: "Estilo",
    length: "Tamanho",
    effort: "Esforço",
    instructions: "Preferências",
    instructionsPlaceholder: "ex.: foque nos números",
    styles: {
      summary: { label: "Resumo", hint: "introdução + pontos-chave" },
      bullets: { label: "Tópicos", hint: "" },
      detailed: { label: "Detalhado", hint: "seções cobrindo tudo" },
      simple: { label: "Simples", hint: "linguagem fácil" },
      study: { label: "Estudo", hint: "conceitos + perguntas de revisão" },
    },
    lengths: { short: "Curto", medium: "Médio", long: "Longo" },
    efforts: { low: "Rápido", medium: "Equilibrado", high: "Profundo" },
    effortChoices: {
      low: "Rápido",
      medium: "Equilibrado",
      high: "Profundo (mais lento)",
    },
    effortHighHint: (models) =>
      models
        ? `Mais lento e mais caro, sobretudo com ${models}.`
        : "Mais lento e mais caro.",
    invalidChoice: "Escolha uma das opções.",
    instructionsTooLong: (max) => `Até ${max} caracteres.`,
  },
  credits: {
    title: "Créditos",
    count: (n, formatted) =>
      `${formatted} ${Math.abs(n) === 1 ? "crédito" : "créditos"}`,
    unit: "créditos",
    balance: "Saldo",
    about:
      "O preço depende da quantidade de texto, do modelo, do esforço, do estilo e do tamanho, e aparece antes de você resumir.",
    statement: "Extrato",
    kinds: {
      signup_bonus: "Bônus de boas-vindas",
      summary: "Resumo",
      refund: "Devolução",
      adjustment: "Ajuste",
      translation: "Tradução",
      purchase: "Compra de créditos",
      purchase_reversal: "Compra estornada",
    },
    deletedSummary: "resumo excluído",
    balanceAfter: (formatted) => `saldo ${formatted}`,
    emptyTitle: "Nenhuma movimentação ainda",
    loadError: "Não foi possível carregar seu extrato.",
    quoteError: "Não foi possível obter o preço.",
    insufficientTitle: "Créditos insuficientes",
    insufficient: (price, balance) =>
      `Este resumo custa ${price} e seu saldo é ${balance}. Um modelo, esforço ou tamanho mais barato pode caber, ou compre mais créditos.`,
    priceChanged: (price) =>
      `O preço mudou para ${price}. Nada foi cobrado: resuma de novo para confirmar.`,
    refunded: "Seus créditos foram devolvidos.",
    negativeTitle: "Seu saldo está negativo",
    negativeBody:
      "Os créditos de uma compra reembolsada ou contestada foram retirados. Compre créditos para voltar a resumir e traduzir.",
  },
  history: {
    title: "Histórico",
    emptyTitle: "Nenhum resumo ainda",
    emptyBody: "Tudo o que você resumir fica salvo aqui.",
    loadError: "Não foi possível carregar seu histórico.",
    loadingMore: "Carregando mais…",
    back: "Histórico",
    notFound: "Este resumo não existe mais.",
    loadSummaryError: "Não foi possível carregar este resumo.",
    search: "Buscar resumos",
    types: {
      webpage: "Página",
      selection: "Seleção",
      pdf: "PDF",
      text: "Arquivo de texto",
    },
    filters: "Filtros",
    type: "Tipo",
    allTypes: "Todos",
    site: "Site",
    period: "Período",
    any: "Qualquer",
    periods: {
      all: "Qualquer data",
      "7d": "Últimos 7 dias",
      "30d": "Últimos 30 dias",
      custom: "Personalizado",
    },
    from: "De",
    to: "Até",
    noResultsTitle: "Nenhum resumo encontrado",
    noResultsBody: "Tente outras palavras ou menos filtros.",
    clearFilters: "Limpar filtros",
    delete: "Excluir",
    deleteTitle: "Excluir este resumo?",
    deleteBody: "Ele será removido do seu histórico. Não é possível desfazer.",
    deleteError: "Não foi possível excluir. Tente de novo.",
    deleteTranslationTitle: (language) => `Excluir a tradução em ${language}?`,
    deleteOriginalTitle: (language) => `Excluir a versão em ${language}?`,
    deleteOriginalBody: (next) =>
      `O resumo continua no seu histórico, agora em ${next}. As outras traduções continuam. Os créditos não são devolvidos.`,
    deleteOriginal: "Excluir esta versão",
    deleteEverything: "Excluir tudo",
    deleteTranslationBody:
      "Só esta tradução é removida: o resumo original e as outras traduções continuam. Os créditos não são devolvidos.",
  },

  pickerHint: "clique para selecionar · ↑ pai · ↓ filho · esc cancela",
};

export const dictionaries: Record<Locale, Dictionary> = { en, "pt-br": ptBr };

export function getDictionary(locale: Locale) {
  return dictionaries[locale];
}
