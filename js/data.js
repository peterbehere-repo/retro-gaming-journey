// Retro Gaming Journey — System Directory Data Grid
// 600 titles: 5 genres x 6 platforms x exactly 20 titles each.
// Source: Rool Agent Build Pack, Section 5 (verbatim transcription).
"use strict";

const PLATFORMS = {
  nes:     { name: "NES",          short: "NES" },
  tg16:    { name: "TurboGrafx-16", short: "TG16" },
  genesis: { name: "SEGA Genesis",  short: "Genesis" },
  snes:    { name: "SNES",          short: "SNES" },
  gba:     { name: "GBA",           short: "GBA" },
  nds:     { name: "NDS",           short: "NDS" }
};

const GENRES = ["Action", "Adventure", "RPG", "Puzzle", "Visual Novels/Point & Click"];

const GAME_LIBRARY = {
  "Action": {
    "nes": [
      "Contra", "Super Mario Bros. 3", "Mega Man 2", "Ninja Gaiden", "Castlevania III",
      "Double Dragon II", "Bionic Commando", "Duck Tales", "Blaster Master", "River City Ransom",
      "Life Force", "Gradius", "Jackal", "Skate or Die!", "Punch-Out!!",
      "Bubble Bobble", "Rygar", "Ikari Warriors", "Strider", "Section Z"
    ],
    "tg16": [
      "Bonk's Adventure", "Air Zonk", "Blazing Lazers", "Soldier Blade", "Splatterhouse",
      "Ninja Spirit", "R-Type", "Alien Crush", "Super Star Soldier", "Galaga '90",
      "Cyber Core", "Side Arms", "Dragon Spirit", "Parasol Stars", "Legendary Axe",
      "Ordyne", "Psychic Storm", "Sinistron", "Raiden", "Bloody Wolf"
    ],
    "genesis": [
      "Gunstar Heroes", "Sonic the Hedgehog 2", "Streets of Rage 2", "Shinobi III", "Contra: Hard Corps",
      "Castlevania: Bloodlines", "Golden Axe II", "Rocket Knight Adventures", "Alien Soldier", "Comix Zone",
      "Vectorman", "Earthworm Jim", "Strider", "Aladdin", "Mercs",
      "Ghouls 'n Ghosts", "Thunder Force IV", "Splatterhouse 3", "Musha", "Dynamite Headdy"
    ],
    "snes": [
      "Super Metroid", "Super Mario World", "Mega Man X", "Castlevania IV", "Contra III",
      "Donkey Kong Country 2", "Wild Guns", "Hagane", "Sunset Riders", "Super Punch-Out!!",
      "Teenage Mutant Ninja Turtles IV", "Star Fox", "ActRaiser", "Demon's Crest", "Cybernator",
      "The Combatribes", "Super Ghouls 'n Ghosts", "Space Megaforce", "Axelay", "R-Type III"
    ],
    "gba": [
      "Mega Man Zero 3", "Metroid Fusion", "Castlevania: Aria of Sorrow", "Metroid: Zero Mission", "Gunstar Super Heroes",
      "Astro Boy: Omega Factor", "Sonic Advance 2", "Mega Man Battle Network 3", "Wario Land 4", "Drill Dozer",
      "Klonoa: Empire of Dreams", "Super Mario Advance 4", "Castlevania: Circle of the Moon", "Kirby & The Amazing Mirror", "Max Payne",
      "Metal Slug Advance", "Ninja Five-O", "Grand Theft Auto Advance", "Spider-Man 2", "Contra Advance"
    ],
    "nds": [
      "Castlevania: Order of Ecclesia", "Castlevania: Dawn of Sorrow", "Contra 4", "Metal Slug 7", "Ninja Gaiden: Dragon Sword",
      "Grand Theft Auto: Chinatown Wars", "Mega Man Zero Collection", "Sonic Rush", "Kirby Super Star Ultra", "Bangai-O Spirits",
      "Henry Hatsworth", "Mega Man ZX", "New Super Mario Bros.", "Aliens: Infestation", "Viewtiful Joe: Double Trouble",
      "Metroid Prime Hunters", "Bleach: Dark Souls", "Space Invaders Extreme 2", "N+", "Thor: God of Thunder"
    ]
  },
  "Adventure": {
    "nes": [
      "The Legend of Zelda", "Zelda II: The Adventure of Link", "Metroid", "Crystalis", "StarTropics",
      "Faxanadu", "The Goonies II", "Battle of Olympus", "Willow", "Clash at Demonhead",
      "Rygar", "Legacy of the Wizard", "Kid Icarus", "Blaster Master", "Simon's Quest",
      "Monster Party", "Maniac Mansion", "Tombs & Treasure", "Xexyz", "Goonies"
    ],
    "tg16": [
      "Neutopia", "Neutopia II", "The Legendary Axe II", "Dungeon Explorer", "Dungeon Explorer II",
      "Cadash", "Ys Book I & II", "Ys III: Wanderers from Ys", "Dragon's Curse", "Military Madness",
      "Beyond Shadowgate", "Cratermaze", "TaleSpin", "Falcon", "Chiki Chiki Boys",
      "Tiger Road", "New Adventure Island", "Gargoyle's Quest II", "Somer Assault", "Bravoman"
    ],
    "genesis": [
      "Landstalker", "Beyond Oasis", "Crusader of Centy", "Wonder Boy in Monster World", "Monster World IV",
      "Flashback", "Out of this World", "QuackShot", "Castle of Illusion", "Alisia Dragoon",
      "Light Crusader", "Ecco the Dolphin", "Ecco: The Tides of Time", "Chakan: The Forever Man", "Jurassic Park",
      "X-Men 2: Clone Wars", "The Lost World: Jurassic Park", "Pirates! Gold", "Another World", "Cadash"
    ],
    "snes": [
      "The Legend of Zelda: A Link to the Past", "Super Metroid", "Super Mario RPG", "Secret of Mana", "Terranigma",
      "Illusion of Gaia", "Soul Blazer", "Secret of Evermore", "Another World", "Flashback",
      "Prince of Persia", "Blackthorne", "The Lost Vikings", "The Lost Vikings 2", "Goof Troop",
      "Hook", "Indiana Jones' Greatest Adventures", "Aladdin", "The Lion King", "Jurassic Park"
    ],
    "gba": [
      "The Legend of Zelda: The Minish Cap", "Metroid Fusion", "Metroid: Zero Mission", "Castlevania: Aria of Sorrow", "Castlevania: Harmony of Dissonance",
      "Boktai: The Sun is in Your Hand", "Boktai 2: Solar Boy Django", "Shaman King: Master of Spirits", "Shaman King: Master of Spirits 2", "The Legend of Zelda: A Link to the Past Four Swords",
      "Spider-Man: Mysterio's Menace", "Kingdom Hearts: Chain of Memories", "Baldur's Gate: Dark Alliance", "Scurge: Hive", "Lego Star Wars II",
      "Bruce Lee: Return of the Legend", "Sabre Wulf", "Peter Pan: The Motion Picture Event", "Pitfall: The Lost Expedition", "Lady Sia"
    ],
    "nds": [
      "The Legend of Zelda: Phantom Hourglass", "The Legend of Zelda: Spirit Tracks", "Okamiden", "Metroid Prime: Pinball", "Monster Tale",
      "Solatorobo: Red the Hunter", "Custom Robo Arena", "Spider-Man: Shattered Dimensions", "Tomb Raider: Underworld", "Blue Dragon Plus",
      "Spectrobes", "Spectrobes: Beyond the Portals", "Chibi-Robo!: Park Patrol", "Lost in Blue", "Lost in Blue 2",
      "Lost in Blue 3", "Drawn to Life", "Drawn to Life: The Next Chapter", "Avatar: The Last Airbender", "Resident Evil: Deadly Silence"
    ]
  },
  "RPG": {
    "nes": [
      "Final Fantasy", "Dragon Warrior", "Dragon Warrior III", "Dragon Warrior IV", "Dragon Warrior II",
      "Crystalis", "EarthBound Beginnings", "The Magic of Scheherazade", "Destiny of an Emperor", "Pool of Radiance",
      "Ultima III: Exodus", "Ultima IV: Quest of the Avatar", "Bard's Tale", "Wizardry: Proving Grounds", "Sweet Home",
      "Faxanadu", "Willow", "Legacy of the Wizard", "Might and Magic Book One", "Tombs & Treasure"
    ],
    "tg16": [
      "Ys Book I & II", "Ys III: Wanderers from Ys", "Neutopia", "Neutopia II", "Dungeon Explorer",
      "Dungeon Explorer II", "Cadash", "Double Dungeons", "Cosmic Fantasy 2", "Dragon's Curse",
      "Bravoman", "Legend of Hero Tonma", "Magical Chase", "Military Madness", "Order of the Griffon",
      "Shiryu Fushigi no Ryu", "Sorcerian", "Vasteel", "World Court Tennis", "Digital Comic Monsters"
    ],
    "genesis": [
      "Phantasy Star IV", "Phantasy Star II", "Phantasy Star III", "Shining Force", "Shining Force II",
      "Shining in the Darkness", "Shadowrun", "Sword of Vermilion", "Warsong", "Langrisser II",
      "Crusader of Centy", "Beyond Oasis", "Landstalker", "Light Crusader", "Buck Rogers: Countdown to Doomsday",
      "Faery Tale Adventure", "Might and Magic III", "Sorcerer's Kingdom", "Fatal Labyrinth", "Rings of Power"
    ],
    "snes": [
      "Chrono Trigger", "Final Fantasy VI", "EarthBound", "Super Mario RPG", "Final Fantasy IV",
      "Secret of Mana", "Lufia II: Rise of the Sinistrals", "Dragon Quest V", "Dragon Quest VI", "Tactics Ogre",
      "Terranigma", "Illusion of Gaia", "Soul Blazer", "Secret of Evermore", "Shadowrun",
      "Breath of Fire", "Breath of Fire II", "Ogre Battle", "7th Saga", "Robotrek"
    ],
    "gba": [
      "Golden Sun", "Golden Sun: The Lost Age", "Pokemon Emerald", "Pokemon FireRed/LeafGreen", "Final Fantasy Tactics Advance",
      "Mario & Luigi: Superstar Saga", "Mother 3", "Fire Emblem", "Fire Emblem: The Sacred Stones", "Tactics Ogre: The Knight of Lodis",
      "Final Fantasy VI Advance", "Final Fantasy V Advance", "Final Fantasy IV Advance", "Kingdom Hearts: Chain of Memories", "Boktai",
      "Riviera: The Promised Land", "Yggdra Union", "Mega Man Battle Network 3", "Breath of Fire II", "Shiny Soul II"
    ],
    "nds": [
      "Chrono Trigger DS", "Dragon Quest IX", "Pokemon HeartGold/SoulSilver", "Pokemon Black/White", "The World Ends with You",
      "Radiant Historia", "Shin Megami Tensei: Devil Survivor", "Shin Megami Tensei: Devil Survivor 2", "Dragon Quest V", "Dragon Quest IV",
      "Dragon Quest VI", "Mario & Luigi: Bowser's Inside Story", "Mario & Luigi: Partners in Time", "Final Fantasy IV DS", "Final Fantasy III DS",
      "Etrian Odyssey III", "Etrian Odyssey II", "Rune Factory 3", "Suikoden Tierkreis", "Luminous Arc 2"
    ]
  },
  "Puzzle": {
    "nes": [
      "Tetris", "Dr. Mario", "Yoshi's Cookie", "Wario's Woods", "Kickle Cubicle",
      "Adventures of Lolo", "Adventures of Lolo 2", "Adventures of Lolo 3", "Klax", "Pipe Dream",
      "Puzznic", "Solomon's Key", "Fire 'n Ice", "Bomberman", "Bomberman II",
      "Q*bert", "Yoshi", "Mendel Palace", "Boulder Dash", "Columns"
    ],
    "tg16": [
      "Alien Crush", "Devil's Crush", "Bomberman '93", "Bomberman '94", "Chew Man Fu",
      "Cratermaze", "Drop Off", "Klax", "Be Ball", "Boxy Boy",
      "Pac-Land", "Time Cruise", "Tricky Kick", "Break In", "Block Out",
      "Columns", "Puzznic", "Zipang", "Yo' Bro", "Pushover"
    ],
    "genesis": [
      "Columns", "Dr. Robotnik's Mean Bean Machine", "Puyo Puyo 2", "The Lost Vikings", "Lemmings",
      "Pac-Attack", "Shove It! The Warehouse Game", "Zoom!", "Klax", "Marble Madness",
      "Flicky", "Blockout", "Trampoline Terror!", "Bonanza Bros.", "Columns III",
      "Mega Bomberman", "Krush Kill 'n Destroy", "Paperboy", "Ultimate Q*bert", "Gear Works"
    ],
    "snes": [
      "Tetris Attack", "Super Puyo Puyo 2", "Tetris & Dr. Mario", "Kirby's Avalanche", "Wario's Woods",
      "The Lost Vikings", "The Lost Vikings 2", "Bust-A-Move", "Lemmings", "Lemmings 2: The Tribes",
      "Troddlers", "Wild Snakes", "Pieces", "Super Bomberman 3", "Super Bomberman 5",
      "Pac-Attack", "Krasty's Super Fun House", "BreakThru!", "On The Ball", "Sparkster Puzzle"
    ],
    "gba": [
      "Super Puzzle Fighter II Turbo", "WarioWare, Inc.: Mega Microgame$!", "WarioWare: Twisted!", "Dr. Mario & Puzzle League", "Puyo Pop Fever",
      "ChuChu Rocket!", "Mario vs. Donkey Kong", "Kuru Kuru Kururin", "Kururin Paradise", "It's Mr. Pants",
      "Polarium Advance", "Denki Blocks!", "Guru Logic Champ", "Super Bust-A-Move", "Columns Crown",
      "Bubble Bobble Old & New", "Egg Mania", "Snood", "Zoo Keeper", "Lumines Mobile"
    ],
    "nds": [
      "Tetris DS", "Planet Puzzle League", "Picross DS", "Picross 3D", "Meteos",
      "Professor Layton and the Curious Village", "Professor Layton and the Diabolical Box", "Professor Layton and the Unwound Future", "Professor Layton and the Last Specter", "Ghost Trick: Phantom Detective",
      "Might & Magic: Clash of Heroes", "Bejeweled Twist", "Puzzle Quest: Challenge of the Warlords", "Polarium", "Zookeeper",
      "Prism: Light the Way", "Neves", "Bust-A-Move DS", "Exit DS", "Bomberman Land Touch!"
    ]
  },
  "Visual Novels/Point & Click": {
    "nes": [
      "Shadowgate", "The Uninvited", "Déjà Vu", "Maniac Mansion", "Princess Tomato in the Salad Kingdom",
      "King's Quest V", "Tombs & Treasure", "Nightshade", "Portopia Serial Murder Case", "Famicom Detective Club Part II",
      "Famicom Detective Club", "Sweet Home", "Jesus: Dreadful Bio-Monster", "Linus Spacehead's Cosmic Crusade", "Dr. Jekyll and Mr. Hyde",
      "Gargoyle's Quest II", "Hudson Hawk", "North and South", "Where in Time is Carmen Sandiego?", "Home Alone"
    ],
    "tg16": [
      "Beyond Shadowgate", "Snatcher", "J.B. Harold Murder Club", "Sherlock Holmes Consulting Detective", "Sherlock Holmes Vol II",
      "Loom", "Maniac Mansion", "Gulliver Boy", "Graduation", "Marchen Maze",
      "Mirai Shounen Conan", "Ryuuko no Ken", "Tenchi Muyo!", "Urusei Yatsura", "Digital Comic Monsters",
      "Gradius Story", "Valis Visuals", "Yserbius", "Wonder Boy Visual", "Nadia: Secret of Blue Water"
    ],
    "genesis": [
      "Snatcher", "Scooby-Doo Mystery", "Shadowrun", "The King's Quest V", "Phantasy Star Text Adventures",
      "Maniac Mansion", "Jurassic Park", "Flashback", "Out of this World", "Valis III",
      "Willy Beamish", "Rise of the Dragon", "Monkey Island", "The Terminator CD", "Dune",
      "Dracula Unleashed", "Night Trap", "Sewer Shark", "Ground Zero Texas", "Double Switch"
    ],
    "snes": [
      "Clock Tower", "Famicom Detective Club Part II", "The Firemen", "Shadowrun", "Maniac Mansion",
      "Scooby-Doo Mystery", "Super Famicom Wars", "Bishoujo Senshi Sailor Moon Another Story", "Kamaitachi no Yoru", "Otogirisou",
      "School Horror Story", "Tsukikomori", "Tactics Ogre", "Front Mission", "Live A Live",
      "Radical Dreamers", "Bahamut Lagoon", "Metal Max 2", "Gunman's Proof", "Yoshi's Safari Adventure"
    ],
    "gba": [
      "Phoenix Wright: Ace Attorney", "Ace Attorney 2: Justice for All", "Ace Attorney 3: Trials and Tribulations", "Another Code", "Silent Hill Play Novel",
      "Riviera: The Promised Land", "Yggdra Union", "Zone of the Enders: The Fist of Mars", "Broken Sword: The Shadow of the Templars", "Kingdom Hearts: Chain of Memories",
      "Boktai", "Boktai 2", "Sabre Wulf", "Taxi 3", "Harry Potter and the Prisoner of Azkaban",
      "Lego Star Wars", "The Sims 2: Pets", "The Sims Bustin' Out", "Urbz: Sims in the City", "Yu-Gi-Oh! Sacred Cards"
    ],
    "nds": [
      "999: Nine Hours, Nine Persons, Nine Doors", "Phoenix Wright: Ace Attorney", "Phoenix Wright: Justice for All", "Phoenix Wright: Trials and Tribulations", "Apollo Justice: Ace Attorney",
      "Ace Attorney Investigations: Miles Edgeworth", "Hotel Dusk: Room 215", "Last Window: The Secret of Cape West", "Ghost Trick: Phantom Detective", "Time Hollow",
      "Theresia", "Trace Memory", "Another Code: Two Memories", "Touch Detective", "Touch Detective 2 1/2",
      "Jake Hunter: Detective Chronicles", "Jake Hunter: Memories of the Past", "Lux-Pain", "Professor Layton and the Curious Village", "Ace Attorney Investigations 2"
    ]
  }
};

// Stable id for a game: deterministic slug of genre + platform + title.
function gameId(genre, platform, title) {
  const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${slug(genre)}__${platform}__${slug(title)}`;
}

// Flatten into a single array of { id, genre, platform, title } records.
function flattenLibrary() {
  const out = [];
  for (const genre of GENRES) {
    for (const platform of Object.keys(PLATFORMS)) {
      for (const title of GAME_LIBRARY[genre][platform]) {
        out.push({ id: gameId(genre, platform, title), genre, platform, title });
      }
    }
  }
  return out;
}

const ALL_GAMES = flattenLibrary();

// Iteration gate (Peter, 2026-10-25): the site reveals one console per iteration.
// The full 600-title grid stays intact above — this only gates visibility and stats.
// Iteration 2: add "tg16" here; later iterations add genesis, snes, gba, nds.
const ACTIVE_PLATFORMS = ["nes"];
const ACTIVE_GAMES = ALL_GAMES.filter(g => ACTIVE_PLATFORMS.includes(g.platform));
