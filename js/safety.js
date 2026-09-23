const BOT = "Safety Pip";

const WARN = [
  /\b(discord|instagram|\binsta\b|snapchat|\bsnap\b|tiktok|whatsapp|telegram|\bkik\b|facebook)\b/,
  /\b(phone number|phone #|e-?mail|gmail|hotmail)\b/,
  /\b(here'?s|this is|share|sharing) my (discord|snap|number|email|phone)\b/,
  /\b(add me|dm me|text me|message me|pm me|friend me)\b/,
  /\b(discord\.gg|instagram\.com|snapchat\.com|tiktok\.com)\b/,
  /\b\w+#\d{3,5}\b/,
  /\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/,
  /\b(\+?\d[\d\s.-]{7,}\d)\b/,
];

const ADDRESS = [
  /\b(here'?s|this is|share|sharing) my (address|house|home|place)\b/,
  /\b(my|our) (home |house |street )?address\b/,
  /\bcome to my (house|place|home)\b/,
  /\bmy house is\b/,
  /\blive at\b/,
];

const KID = /\b(kid|kids|child|children|minor|minors|underage|little (kid|boy|girl|child)|young (kid|boy|girl))\b/;
const SEX = /\b(sex|sexual|sexy|nude|nudes|naked|porn|nsfw|boob|boobs|penis|vagina|horny|xxx)\b/;

const PREDATOR = [
  /\bour secret\b/,
  /\bkeep (this|it) (a )?secret\b/,
  /\bdon'?t tell (anyone|anybody|mom|dad|mummy|daddy|parents|grown-?ups)\b/,
  /\bmeet (me )?(alone|privately|in private|in secret)\b/,
  /\bcome (over )?alone\b/,
  /\bsend (me )?(a )?(pic|pics|photo|photos|picture|pictures|nude|nudes|selfie)\b/,
  /\b(take|send) (off|your clothes)\b/,
  /\bage\s*(play|gap)\b/,
];

const SWEAR = [
  /\b(fuck|fuk|fck|fucking|motherfucker|mf)\b/,
  /\b(shit|shite|bullshit|horseshit)\b/,
  /\b(asshole|asswipe|dumbass|jackass)\b/,
  /\b(bitch|bastard|slut|whore)\b/,
  /\b(dick|cock|pussy)\b/,
  /\b(cunt|twat)\b/,
  /\b(piss|pissed)\b/,
  /\b(damn|dammit|goddamn)\b/,
  /\b(crap|crappy)\b/,
  /\b(wtf|stfu|gtfo)\b/,
  /\b(fag|faggot|retard|retarded)\b/,
  /\bn+i+g+e*r+\b/,
];

function normalize(text) {
  let n = String(text || "")
    .toLowerCase()
    .replace(/[@]/g, "a")
    .replace(/\$/g, "s")
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/[^a-z0-9.#+\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  let next = n.replace(/\b([a-z]) (?=[a-z]\b)/g, "$1");
  while (next !== n) {
    n = next;
    next = n.replace(/\b([a-z]) (?=[a-z]\b)/g, "$1");
  }
  return n;
}

export function moderateText(text) {
  const n = normalize(text);
  if (!n) return { action: "ok" };
  if (PREDATOR.some((re) => re.test(n)) || (KID.test(n) && SEX.test(n))) {
    return { action: "ban", reason: "predator" };
  }
  if (ADDRESS.some((re) => re.test(n))) {
    return { action: "ban", reason: "address" };
  }
  if (SWEAR.some((re) => re.test(n))) {
    return { action: "block", reason: "swear" };
  }
  if (WARN.some((re) => re.test(n))) {
    return { action: "warn", reason: "contact" };
  }
  return { action: "ok" };
}

export function safetySelfCheck() {
  const cases = [
    ["hello friends", "ok"],
    ["here's my discord", "warn"],
    ["add me on snap", "warn"],
    ["come to my house", "ban"],
    ["here's my address", "ban"],
    ["kid " + "nude", "ban"],
    ["don't tell parents", "ban"],
    ["meet me alone", "ban"],
    ["send pics", "ban"],
    ["class hangout", "ok"],
    ["hello friends", "ok"],
    ["shit plot", "block"],
    ["f u c k town", "block"],
  ];
  return cases.every(([text, expected]) => moderateText(text).action === expected);
}

export const SAFETY_BOT = BOT;
