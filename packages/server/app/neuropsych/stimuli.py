"""
Canonical stimuli for the UDS-3 neuropsychological test battery.

Contains story text, digit sequences, trail sequences, and MINT items
used as ground-truth references during scoring.
"""

from typing import Any, Dict, List

# ---------------------------------------------------------------------------
# Craft Story 21 — Immediate and Delayed Recall
# ---------------------------------------------------------------------------

CRAFT_STORY_TEXT = (
    "Anna / Thompson / of South / Boston / employed / as a cook / "
    "in a school / cafeteria / reported / at the police / station / "
    "that she had been / held up / on State Street / the night / before / "
    "and robbed / of fifty-six / dollars. / She had four / small children / "
    "the rent / was due / and they hadn't / eaten / for two days. / "
    "The police / touched / by the woman's / story / took up / a collection / "
    "for her."
)

CRAFT_STORY_UNITS: List[str] = [
    "Anna",
    "Thompson",
    "South",
    "Boston",
    "employed",
    "cook",
    "school",
    "cafeteria",
    "reported",
    "police station",
    "held up",
    "State Street",
    "night before",
    "robbed",
    "fifty-six dollars",
    "four",
    "small children",
    "rent was due",
    "hadn't eaten",
    "two days",
    "police",
    "touched",
    "woman's story",
    "took up",
    "collection",
]

# ---------------------------------------------------------------------------
# Digit Span — Forward and Backward
# ---------------------------------------------------------------------------

DIGIT_SPAN_SEQUENCES: Dict[str, List[List[List[int]]]] = {
    "forward": [
        [[1, 7], [6, 3]],               # length 2
        [[5, 8, 2], [6, 9, 4]],         # length 3
        [[6, 4, 3, 9], [7, 2, 8, 6]],   # length 4
        [[4, 2, 7, 3, 1], [7, 5, 8, 3, 6]],  # length 5
        [[6, 1, 9, 4, 7, 3], [3, 9, 2, 4, 8, 7]],  # length 6
        [[5, 9, 1, 7, 4, 2, 8], [4, 1, 7, 9, 3, 8, 6]],  # length 7
        [[5, 8, 1, 9, 2, 6, 4, 7], [3, 8, 2, 9, 6, 1, 7, 4]],  # length 8
        [[2, 7, 5, 8, 6, 2, 5, 8, 4], [7, 1, 3, 9, 4, 2, 5, 6, 8]],  # length 9
    ],
    "backward": [
        [[2, 4], [5, 7]],               # length 2
        [[6, 2, 9], [4, 1, 5]],         # length 3
        [[3, 2, 7, 9], [4, 9, 6, 8]],   # length 4
        [[1, 5, 2, 8, 6], [6, 1, 8, 4, 3]],  # length 5
        [[5, 3, 9, 4, 1, 8], [7, 2, 4, 8, 5, 6]],  # length 6
        [[8, 1, 2, 9, 3, 6, 5], [4, 7, 3, 9, 1, 2, 8]],  # length 7
        [[9, 4, 3, 7, 6, 2, 5, 8], [7, 2, 8, 1, 9, 6, 5, 3]],  # length 8
    ],
}

# ---------------------------------------------------------------------------
# Trail Making Test — Oral (A and B)
# ---------------------------------------------------------------------------

TMT_A_SEQUENCE: List[str] = [str(i) for i in range(1, 26)]

TMT_B_SEQUENCE: List[str] = []
_letters = "ABCDEFGHIJKLM"
for i in range(13):
    TMT_B_SEQUENCE.append(str(i + 1))
    TMT_B_SEQUENCE.append(_letters[i])

# ---------------------------------------------------------------------------
# Multilingual Naming Test (MINT) — 32 items
# ---------------------------------------------------------------------------

MINT_ITEMS: List[Dict[str, Any]] = [
    {"id": 1, "target": "comb", "semantic_cue": "used for hair", "phonemic_cue": "co"},
    {"id": 2, "target": "mushroom", "semantic_cue": "a type of fungus", "phonemic_cue": "mu"},
    {"id": 3, "target": "camel", "semantic_cue": "a desert animal", "phonemic_cue": "ca"},
    {"id": 4, "target": "hanger", "semantic_cue": "used for clothes", "phonemic_cue": "ha"},
    {"id": 5, "target": "volcano", "semantic_cue": "a mountain that erupts", "phonemic_cue": "vol"},
    {"id": 6, "target": "saw", "semantic_cue": "a cutting tool", "phonemic_cue": "sa"},
    {"id": 7, "target": "toothbrush", "semantic_cue": "used for dental hygiene", "phonemic_cue": "too"},
    {"id": 8, "target": "helicopter", "semantic_cue": "a flying vehicle", "phonemic_cue": "hel"},
    {"id": 9, "target": "broom", "semantic_cue": "used for sweeping", "phonemic_cue": "br"},
    {"id": 10, "target": "rhinoceros", "semantic_cue": "a large African animal with a horn", "phonemic_cue": "rhi"},
    {"id": 11, "target": "barrel", "semantic_cue": "a container", "phonemic_cue": "ba"},
    {"id": 12, "target": "snail", "semantic_cue": "a slow creature with a shell", "phonemic_cue": "sna"},
    {"id": 13, "target": "wreath", "semantic_cue": "hung on a door at holidays", "phonemic_cue": "wr"},
    {"id": 14, "target": "bench", "semantic_cue": "a place to sit", "phonemic_cue": "be"},
    {"id": 15, "target": "compass", "semantic_cue": "used for navigation", "phonemic_cue": "com"},
    {"id": 16, "target": "tripod", "semantic_cue": "holds a camera", "phonemic_cue": "tri"},
    {"id": 17, "target": "scroll", "semantic_cue": "an ancient document", "phonemic_cue": "scr"},
    {"id": 18, "target": "tongs", "semantic_cue": "used to grip things", "phonemic_cue": "to"},
    {"id": 19, "target": "sphinx", "semantic_cue": "an Egyptian monument", "phonemic_cue": "sph"},
    {"id": 20, "target": "stethoscope", "semantic_cue": "a doctor's instrument", "phonemic_cue": "ste"},
    {"id": 21, "target": "protractor", "semantic_cue": "measures angles", "phonemic_cue": "pro"},
    {"id": 22, "target": "abacus", "semantic_cue": "used for counting", "phonemic_cue": "ab"},
    {"id": 23, "target": "knocker", "semantic_cue": "on a door", "phonemic_cue": "kno"},
    {"id": 24, "target": "palette", "semantic_cue": "used by painters", "phonemic_cue": "pa"},
    {"id": 25, "target": "unicorn", "semantic_cue": "a mythical horse", "phonemic_cue": "un"},
    {"id": 26, "target": "accordion", "semantic_cue": "a musical instrument", "phonemic_cue": "acc"},
    {"id": 27, "target": "asparagus", "semantic_cue": "a green vegetable", "phonemic_cue": "asp"},
    {"id": 28, "target": "pretzel", "semantic_cue": "a twisted snack", "phonemic_cue": "pre"},
    {"id": 29, "target": "seahorse", "semantic_cue": "a marine creature", "phonemic_cue": "sea"},
    {"id": 30, "target": "hammock", "semantic_cue": "used for resting outdoors", "phonemic_cue": "ha"},
    {"id": 31, "target": "stilts", "semantic_cue": "make you taller", "phonemic_cue": "sti"},
    {"id": 32, "target": "dominoes", "semantic_cue": "a tile game", "phonemic_cue": "do"},
]

# ---------------------------------------------------------------------------
# Category fluency subcategory maps (for clustering analysis)
# ---------------------------------------------------------------------------

ANIMAL_SUBCATEGORIES: Dict[str, List[str]] = {
    "pets": ["dog", "cat", "hamster", "guinea pig", "goldfish", "parrot", "rabbit", "ferret", "gerbil", "turtle"],
    "farm": ["cow", "pig", "horse", "sheep", "goat", "chicken", "duck", "turkey", "donkey", "mule", "rooster"],
    "african": ["lion", "tiger", "elephant", "giraffe", "zebra", "hippo", "rhino", "cheetah", "leopard", "gorilla", "hyena", "gazelle"],
    "aquatic": ["whale", "dolphin", "shark", "fish", "seal", "octopus", "squid", "jellyfish", "crab", "lobster", "salmon", "tuna", "otter", "walrus"],
    "birds": ["eagle", "hawk", "owl", "robin", "sparrow", "crow", "pigeon", "penguin", "flamingo", "swan", "goose", "parrot", "hummingbird", "pelican", "ostrich"],
    "insects": ["ant", "bee", "butterfly", "spider", "mosquito", "fly", "beetle", "grasshopper", "cockroach", "dragonfly", "ladybug", "moth", "cricket", "wasp"],
    "reptiles": ["snake", "lizard", "turtle", "alligator", "crocodile", "iguana", "gecko", "chameleon", "tortoise", "cobra"],
    "rodents": ["mouse", "rat", "squirrel", "chipmunk", "beaver", "porcupine", "hamster", "gerbil", "guinea pig"],
    "primates": ["monkey", "gorilla", "chimpanzee", "orangutan", "baboon", "lemur"],
    "north_american": ["deer", "bear", "moose", "elk", "raccoon", "skunk", "wolf", "fox", "coyote", "bison", "beaver", "badger"],
    "australian": ["kangaroo", "koala", "platypus", "wombat", "emu"],
}
