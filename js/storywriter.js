// Built-in story writer (no AI service needed): turns a theme like "Mia learns how to share her toys" into a
// complete moral story: intro, problem, feelings, advice, the right choice, happy ending, with recurring characters.

const LESSONS = [
  { re: /\b(?:shar(e|ing))/, key: "share", title: "Learns to Share", place: "sunny park with swings, trees and flowers",
    object: "toys", problem: "doesn't want to share", ask: "Can I play with your {obj} too, please?",
    refuse: "No! They are mine. You can't touch them!", feel: "Playing alone is not much fun", advice: "When we share, the fun gets bigger, not smaller.",
    fix: "Here, Leo! Let's play with my {obj} together!", moral: "Sharing turns one smile into two!" },
  { re: /\b(?:sorry|apolog|forgive)/, key: "sorry", title: "Learns to Say Sorry", place: "sunny beach with a big sandcastle",
    object: "sandcastle", problem: "breaks a friend's sandcastle by mistake and runs away", ask: "Who broke my {obj}?",
    refuse: "It wasn't me!", feel: "Hiding the truth makes my tummy feel heavy", advice: "A brave heart says sorry and helps fix things.",
    fix: "I'm sorry, Leo. It was me. Let's build it again together!", moral: "Saying sorry is a little word with big magic!" },
  { re: /\b(?:patien|wait|turn|line|queue)/, key: "patience", title: "Learns to Wait Her Turn", place: "colourful fair with a long line for the teacup ride",
    object: "turn", problem: "wants to skip the long line", ask: "Hey, please wait for your turn!",
    refuse: "But I don't want to wait!", feel: "Pushing ahead made everyone sad", advice: "Good things come to those who wait patiently.",
    fix: "I'm sorry. I'll wait for my turn like everyone else.", moral: "Waiting your turn is a way of being kind!" },
  { re: /\b(?:try|give up|practi|again|fail)/, key: "try", title: "Never Gives Up", place: "park path with a small shiny bicycle",
    object: "bicycle", problem: "falls off her bicycle and wants to give up", ask: "Are you okay? Want to try again?",
    refuse: "No! I can't do it. I'll never learn!", feel: "Giving up feels worse than falling", advice: "Every expert was once a beginner. Try one more time!",
    fix: "One more time... I can do it!", moral: "Never give up. Every try makes you stronger!" },
  { re: /\b(?:honest|truth|lie|lying)/, key: "honest", title: "Tells the Truth", place: "cozy living room with a broken flower vase",
    object: "vase", problem: "breaks a vase and hides it", ask: "Oh no! Who broke the {obj}?",
    refuse: "Maybe the cat did it!", feel: "A lie feels like a heavy backpack", advice: "Telling the truth is always the bravest choice.",
    fix: "Grandma, I broke the {obj}. I'm really sorry.", moral: "The truth always shines brighter than a lie!" },
  { re: /\b(?:brave|fear|afraid|scared|dark|courage)/, key: "brave", title: "Finds Her Courage", place: "cozy bedroom at night with a little night light",
    object: "night light", problem: "is scared of the dark", ask: "Why are you hiding under the blanket?",
    refuse: "There might be monsters in the dark!", feel: "Being scared all the time is tiring", advice: "Courage isn't having no fear. It's being brave anyway.",
    fix: "I'm brave! The dark is just the night saying goodnight.", moral: "You are braver than you think!" },
  { re: /\b(?:kind|help|care)/, key: "kind", title: "Learns to Be Kind", place: "flower garden with a little lost puppy",
    object: "puppy", problem: "walks past someone who needs help", ask: "Please, can you help me?",
    refuse: "Not now, I'm busy!", feel: "Ignoring a friend made my heart feel cold", advice: "Small acts of kindness make the world brighter.",
    fix: "Don't worry, I'll help you!", moral: "Kindness is a gift everyone can give!" },
  { re: /\b(?:clean|tidy|mess)/, key: "tidy", title: "Learns to Tidy Up", place: "messy playroom full of toys",
    object: "toys", problem: "leaves her toys everywhere", ask: "Ouch! I stepped on a block!",
    refuse: "Tidying is boring!", feel: "I can't find anything in this mess", advice: "When everything has a home, playing is easier.",
    fix: "Let's make tidying a game!", moral: "A tidy room makes a happy home!" },
  { re: /\b(?:teeth|brush|healthy|vegetable|eat|food)/, key: "healthy", title: "Learns Healthy Habits", place: "bright kitchen with colourful vegetables",
    object: "vegetables", problem: "only wants sweets", ask: "Would you like some yummy carrots?",
    refuse: "Yuck! I only want candy!", feel: "Too much candy gives me a tummy ache", advice: "Colourful food makes you strong and full of energy.",
    fix: "Crunch! Carrots are actually yummy!", moral: "Healthy habits make happy, strong kids!" },
  { re: /\b(?:thank|grateful)/, key: "thanks", title: "Learns to Say Thank You", place: "birthday party in a colourful room",
    object: "gift", problem: "forgets to say thank you for a gift", ask: "Do you like the {obj} I made for you?",
    refuse: "It's okay, I guess.", feel: "My friend looks sad now", advice: "Thank you are two words that make hearts happy.",
    fix: "Thank you so much, Leo! I love it!", moral: "Always remember to say thank you!" },
];
const FRIENDS = { girl: { name: "Leo", look: "a cheerful 6-year-old boy with short brown hair, big brown eyes, wearing a green t-shirt and blue jeans" },
  boy: { name: "Zara", look: "a cheerful 6-year-old girl with long black hair in a ponytail, big brown eyes, wearing a yellow dress" } };
const ADULT = { name: "Grandma Rose", look: "a kind grandmother with grey hair in a bun, round glasses and a purple shawl" };
const BUDDY = { name: "Buzzy", look: "a tiny round honeybee with big shiny eyes and a black graduation cap" };
const HERO_LOOK = { girl: "a cheerful 6-year-old girl with long curly dark-brown hair with a yellow flower clip, big brown eyes, wearing a pink dress",
  boy: "a cheerful 7-year-old boy with short black hair, big brown eyes, wearing a blue t-shirt and jeans" };
const BOY_NAMES = "arjun|aarav|kabir|rohan|ravi|rahul|vivaan|aditya|ali|omar|noah|liam|leo|max|sam|tom|ben|jack|ethan|lucas|oliver|james|jake|ryan|adam|dev|ishaan|krish|neil|sid|yash|zayn|daniel|david|mohan|raju";
const STOP = new Set(["A", "An", "The", "One", "Once", "When", "How", "Why", "My", "Our", "Story", "Learn", "Learns", "Today",
  "She", "He", "They", "Girl", "Boy", "Little", "Kid", "Child"]);
const AGE_RE = /\b(?:at\s+)?(?:the\s+)?age\s+(?:of\s+)?(\d{1,2})\b|\b(\d{1,2})[- ]?(?:years?|yrs?)[- ]?old\b/i;
const SKILL_RE = /\blearn(?:s|ed|t|ing)?\s+(?:how\s+)?(?:to\s+)?([a-z][a-z' ]*?)\s*(?:$|[.!?,]|\b(?:at|when|with|from|in|on|because|after|before|by|for)\b)/;
const SKILL_PLACES = [
  [/cook|rice|bak|cake|roti|bread|tea\b|soup|food|pancake|cookie|dal|curry|noodle|egg|sandwich|breakfast|lunch|dinner/, "bright cozy kitchen with pots, pans and colourful spices"],
  [/swim/, "sunny swimming pool with sparkling blue water"],
  [/ride|cycl|bike|skate/, "sunny park path with trees and flowers"],
  [/read|writ|spell|math|count|homework|study/, "cozy room with a little desk and a bookshelf"],
  [/draw|paint|colou?r/, "bright art room with paints and paper"],
  [/danc|sing|music|piano|guitar|violin|drum/, "colourful music room with instruments"],
  [/plant|garden|grow|flower/, "sunny garden with flowers and vegetables"],
];
const cap = (w) => w[0].toUpperCase() + w.slice(1);
const titleCase = (s) => s.split(" ").map((w, i) => (i && /^(a|an|the|to|of|and|in|on)$/.test(w) ? w : cap(w))).join(" ");

/** Returns { title, ending, characters, scenes } in the same shape as parseScript(). */
export function writeLocalStory(idea, nScenes = 6, userChars = []) {
  const text = idea.trim();
  const age = +(text.match(AGE_RE)?.slice(1).find(Boolean) || 0);
  const low = text.toLowerCase().replace(AGE_RE, " ").replace(/\s+/g, " ").trim();
  const skill = low.match(SKILL_RE)?.[1].trim();
  const handsOn = skill && /^(make|cook|bake|prepare|ride|swim|play|draw|paint|read|write|sing|dance|tie|grow|plant|build)\b/.test(skill);
  const lesson = handsOn ? null : LESSONS.find((l) => l.re.test(skill || low)) || (skill ? null : LESSONS.find((l) => l.key === "kind"));
  const lowName = text.match(/^([a-z]{3,})\s+(?:learn|learns|learned|learnt|wants|tries|is|goes|loves|finds|makes|gets|and)\b/i)?.[1];
  const nameInIdea = (text.match(/\b[A-Z][a-z]{2,}\b/g) || []).find((w) => !STOP.has(w)) ||
    (lowName && !STOP.has(cap(lowName.toLowerCase())) ? cap(lowName.toLowerCase()) : undefined);
  const boyName = new RegExp(`^(${BOY_NAMES})$`, "i").test(nameInIdea || "");
  const boy = (/\b(he|his|him|boy)\b/.test(low) || boyName) && !/\b(she|her|girl)\b/.test(low);
  const aged = (look) => (age ? look.replace(/\b\d+-year-old\b/, `${age}-year-old`) : look);
  const hero = userChars[0] || { name: nameInIdea || (boy ? "Arjun" : "Mia"), look: aged(HERO_LOOK[boy ? "boy" : "girl"]) };
  const heroBoy = /\b(boy|he|his)\b/i.test(hero.look) || boy;
  const adult = userChars.slice(1).find((c) => /grand|mom|dad|mother|father|teacher/i.test(c.name + c.look)) || ADULT;
  const defFriend = FRIENDS[heroBoy ? "boy" : "girl"];
  const friend = userChars.slice(1).find((c) => c !== adult) || { ...defFriend, look: aged(defFriend.look) };
  const buddy = userChars.find((c) => c !== hero && c !== friend && c !== adult) || BUDDY;
  const H = hero.name, F = friend.name, A = adult.name, B = buddy.name;
  const she = heroBoy ? "he" : "she", her = heroBoy ? "his" : "her";
  const { all, extra, title } = lesson
    ? lessonScenes({ lesson, low, H, F, A, B, her })
    : skillScenes({ skill, low, age, H, F, A, B, she, her, self: heroBoy ? "himself" : "herself" });
  const order = nScenes <= 3 ? [0, 1, 5] : nScenes === 4 ? [0, 1, 4, 5] : nScenes === 5 ? [0, 1, 3, 4, 5] : [0, 1, 2, 3, 4, 5];
  const scenes = order.map((i) => all[i]);
  for (let k = 0; scenes.length < nScenes && k < 10; k++) scenes.splice(scenes.length - 1, 0, extra[k % extra.length]);
  const used = new Set(scenes.flatMap((s) => s.lines.map((l) => l.speaker)));
  return {
    title: `${H} ${heroBoy ? title.replace(/\bHer\b/, "His") : title}`,
    ending: "The End",
    characters: [hero, friend, adult, buddy].filter((c) => used.has(c.name)),
    scenes: scenes.map((s) => ({ ...s, minDur: 0 })),
  };
}

/** A story about learning a new skill (cooking, swimming, riding a bike...): dream, first try, mess, help, success. */
function skillScenes({ skill, low, age, H, F, A, B, she, her, self }) {
  const ing = /^\w+ing\b/.test(skill);
  const verb = ing ? `do ${skill}` : skill;
  const how = ing ? skill : `how to ${skill}`;
  const mine = (s) => s.replace(/\b(her|his|their)\b/g, "my");
  const words = skill.split(" ");
  const obj = words.length > 1 ? words[words.length - 1] : "";
  const place = SKILL_PLACES.find(([re]) => re.test(low))?.[1] || "sunny backyard with trees and flowers";
  const cooking = place.includes("kitchen");
  const all = [
    { heading: "A Big Dream", visual: `${H} watches ${A} ${verb} in the ${place}, eyes shining with excitement. ${B} floats nearby.`,
      lines: [{ speaker: "Narrator", text: `This is ${H}.${age ? ` ${H} is ${age} years old.` : ""} More than anything, ${she} wants to learn ${how}!` },
        { speaker: H, text: `${A}, can you teach me ${mine(how)}?` },
        { speaker: A, text: age ? `You're ${age} now. I think you're ready! First, watch me carefully.` : "Of course, my little one! First, watch me carefully." }],
      sound: "Cheerful happy music." },
    { heading: "The First Try", visual: `${H} tries to ${verb} all alone in the ${place}, but everything goes wrong, a funny mess everywhere. ${H} looks surprised.`,
      lines: [{ speaker: "Narrator", text: `The next day, ${H} tried to ${verb} all by ${self}. But it was much harder than it looked!` },
        { speaker: H, text: cooking ? `Oh no! The ${obj || "food"} is all wrong!` : "Oh no! This is so hard!" }, { speaker: B, text: "Uh-oh! Bzzz!" }],
      sound: "Music stops, a funny 'uh-oh' sound." },
    { heading: "Feeling Sad", visual: `${H} sits alone and looks sad in the ${place}. ${B} floats beside ${H}.`,
      lines: [{ speaker: "Narrator", text: `${H} felt like giving up.` }, { speaker: H, text: `Maybe I'm too little to ${mine(verb)}...` },
        { speaker: B, text: `Don't give up! Let's ask ${A} for help!` }],
      sound: "Soft gentle emotional music." },
    { heading: `${A}'s Lesson`, visual: `${A} kneels down and shows ${H} what to do, step by step, in the ${place}. ${H} listens carefully.`,
      lines: [{ speaker: A, text: "Everyone makes mistakes at the start. Let's do it together, one step at a time." },
        { speaker: A, text: cooking ? "Measure carefully, follow each step, and be patient." : "Go slowly, watch carefully, and keep practising." },
        { speaker: H, text: "Step by step... okay!" }],
      sound: "Warm calm music." },
    { heading: "Trying Again", visual: `${H} carefully tries again in the ${place} and it works! ${H} smiles proudly and ${A} claps.`,
      lines: [{ speaker: "Narrator", text: `${H} took a deep breath and tried again, slowly and carefully.` },
        { speaker: H, text: "I did it! I really did it!" }, { speaker: A, text: `I'm so proud of you, ${H}!` }],
      sound: "Music becomes happy, a soft magical sparkle." },
    { heading: "A Proud Moment", visual: cooking
      ? `${H} proudly serves the ${obj || "food"} to ${A} and ${F} at the table in the ${place}, everyone smiles, ${B} sparkles around them, magical sparkles everywhere.`
      : `${H} proudly shows ${F} and ${A} ${how} in the ${place}, everyone cheers, ${B} sparkles around them, magical sparkles everywhere.`,
      lines: [{ speaker: "Narrator", text: `And from that day on, ${H} remembered: with patience and practice, you can learn anything!` },
        { speaker: F, text: cooking ? `Yum! This is delicious, ${H}!` : `Wow, ${H}! You're amazing!` }, { speaker: H, text: "Learning new things is the best!" }],
      sound: "Joyful magical music with sparkling chimes." },
  ];
  const extra = [
    { heading: "Practice Makes Perfect", visual: `${H} practises again and again in the ${place}, getting better every time. ${B} cheers.`,
      lines: [{ speaker: H, text: "Practice makes perfect!" }, { speaker: B, text: "Bzzz! You're getting better every time!" }], sound: "Cheerful happy music." },
    { heading: "Sharing the Lesson", visual: `${H} waves to other kids in the ${place}, smiling happily.`,
      lines: [{ speaker: H, text: "Remember, friends: never be afraid to learn something new!" }], sound: "Gentle magical music." },
  ];
  return { all, extra, title: ing ? `Learns ${titleCase(skill)}` : `Learns to ${titleCase(skill)}` };
}

/** A moral story (sharing, saying sorry, being brave...) built from one of the LESSONS. */
function lessonScenes({ lesson, low, H, F, A, B, her }) {
  const word = low.match(/\b(?:her|his|the|my|their)\s+([a-z]+)\b/)?.[1];
  const obj = (word && !lesson.re.test(word) ? word : lesson.object).replace(/^toy$/, "toys");
  const fill = (s) => s.replace(/\{obj\}/g, obj).replace(/Leo/g, F).replace(/\bher\b/g, her);
  const place = lesson.place;
  const all = [
    { heading: "A Happy Day", visual: `${H} plays happily with ${her} ${obj} in a ${place}. ${B} floats nearby, smiling.`,
      lines: [{ speaker: "Narrator", text: `This is ${H}. ${H} loves ${her} ${obj} more than anything!` },
        { speaker: H, text: `Look, ${B}! Isn't this the best day ever?` }, { speaker: B, text: "Bzzz! It's wonderful!" }],
      sound: "Cheerful happy music, birds chirping." },
    { heading: "Uh-oh!", visual: `${F} walks over and waves at ${H} in the ${place}. ${H} holds the ${obj} tightly and looks grumpy.`,
      lines: [{ speaker: "Narrator", text: `Then ${F} came by. But ${H} ${fill(lesson.problem)}.` },
        { speaker: F, text: fill(lesson.ask) }, { speaker: H, text: fill(lesson.refuse) }],
      sound: "Music stops, a funny 'uh-oh' sound." },
    { heading: "Feeling Sad", visual: `${F} looks sad and walks away. ${H} sits alone and looks sad in the ${place}. ${B} floats beside ${H}.`,
      lines: [{ speaker: "Narrator", text: `${F} walked away, feeling sad. Soon ${H} didn't feel happy either.` },
        { speaker: H, text: `${fill(lesson.feel)}...` }, { speaker: B, text: `Maybe ${A} can help us!` }],
      sound: "Soft gentle emotional music." },
    { heading: `${A}'s Advice`, visual: `${A} kneels down and hugs ${H} kindly in the ${place}. ${H} listens carefully.`,
      lines: [{ speaker: A, text: `What's wrong, my little one?` }, { speaker: H, text: `I made ${F} sad.` },
        { speaker: A, text: lesson.advice }],
      sound: "Warm calm music." },
    { heading: "The Right Choice", visual: `${H} walks back to ${F} and waves with a big smile in the ${place}. ${F} looks happy.`,
      lines: [{ speaker: "Narrator", text: `${H} took a deep breath and went back to ${F}.` }, { speaker: H, text: fill(lesson.fix) },
        { speaker: F, text: "Yay! Thank you!" }],
      sound: "Music becomes happy, a soft magical sparkle." },
    { heading: "Happy Together", visual: `${H} and ${F} jump and dance happily together in the ${place}, ${B} sparkles around them, magical sparkles everywhere.`,
      lines: [{ speaker: "Narrator", text: `And from that day on, ${H} remembered: ${lesson.moral}` },
        { speaker: H, text: "Playing together is the best!" }],
      sound: "Joyful magical music with sparkling chimes." },
  ];
  const extra = [
    { heading: "Playing Together", visual: `${H}, ${F} and ${B} play a fun game together in the ${place}, everyone is happy.`,
      lines: [{ speaker: F, text: "This is so much fun!" }, { speaker: H, text: "Let's do it again!" }], sound: "Cheerful happy music." },
    { heading: "Sharing the Lesson", visual: `${H} waves to other kids in the ${place}, smiling happily.`,
      lines: [{ speaker: H, text: `Remember, friends: ${lesson.moral}` }], sound: "Gentle magical music." },
  ];
  return { all, extra, title: lesson.title };
}
