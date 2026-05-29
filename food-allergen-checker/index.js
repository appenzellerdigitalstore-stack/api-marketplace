/**
 * /api/food-allergen-checker
 * Scan any ingredient list or recipe for the 14 major EU allergens
 * + common US allergens. Returns severity levels, cross-contamination
 * risks, safe alternatives, and dietary compatibility matrix.
 */
'use strict';

const express = require('express');
const { getPlan } = require('../shared/planFilter');
const { errorResponse } = require('../shared/utils');

const app = express();
app.use(express.json({ strict: false, type: () => true }));
app.use(express.urlencoded({ extended: true }));

// ── The 14 EU + 2 US major allergens with triggers ─────────────────────────
const ALLERGEN_TRIGGERS = {
  gluten: {
    severity: 'high',
    description: 'Proteins found in wheat, rye, barley, and spelt',
    triggers: ['wheat','flour','bread','pasta','semolina','spelt','kamut','rye','barley','malt','triticale','bulgur','couscous','farro','durum','vital wheat gluten','wheat starch','wheat bran','wheat germ','modified wheat starch'],
    affects: ['Celiac disease','wheat allergy','NCGS'],
    alternatives: ['rice flour','almond flour','oat flour (certified GF)','coconut flour','tapioca'],
  },
  crustaceans: {
    severity: 'high',
    description: 'Shellfish including shrimp, crab, lobster, crayfish',
    triggers: ['shrimp','crab','lobster','crayfish','crawfish','prawn','langoustine','barnacle','krill','scampi'],
    affects: ['shellfish allergy'],
    alternatives: ['fish (if tolerated)','plant-based seafood alternatives'],
  },
  eggs: {
    severity: 'high',
    description: 'Chicken eggs and egg-derived products',
    triggers: ['egg','eggs','albumin','globulin','lysozyme','mayonnaise','meringue','ovalbumin','ovomucin','ovovitellin','silici albuminate','simplesse'],
    affects: ['egg allergy'],
    alternatives: ['flax egg','chia egg','applesauce','aquafaba','commercial egg replacer'],
  },
  fish: {
    severity: 'high',
    description: 'All fish species including salmon, tuna, cod',
    triggers: ['salmon','tuna','cod','bass','flounder','grouper','haddock','halibut','mahi','perch','pike','pollock','tilapia','trout','anchovy','anchovies','fish sauce','worcestershire','surimi','imitation crab'],
    affects: ['fish allergy'],
    alternatives: ['chicken','tofu','chickpeas','jackfruit'],
  },
  peanuts: {
    severity: 'critical',
    description: 'Peanuts and peanut-derived products (groundnuts)',
    triggers: ['peanut','peanuts','groundnut','groundnuts','peanut oil','peanut butter','peanut flour','monkey nuts','mixed nuts','beer nuts','nut meat'],
    affects: ['peanut allergy (anaphylaxis risk)'],
    alternatives: ['sunflower seed butter','tahini','almond butter (if tree nut tolerated)','soy nut butter'],
  },
  soybeans: {
    severity: 'high',
    description: 'Soybeans and soy-derived products',
    triggers: ['soy','soya','soybeans','edamame','tofu','tempeh','miso','natto','tamari','soy sauce','teriyaki','textured vegetable protein','tvp','hydrolyzed soy protein'],
    affects: ['soy allergy'],
    alternatives: ['chickpeas','lentils','coconut aminos (for soy sauce)','sunflower seeds'],
  },
  milk: {
    severity: 'high',
    description: 'Dairy milk and milk-derived products (lactose + casein)',
    triggers: ['milk','cheese','butter','cream','yogurt','whey','casein','lactalbumin','lactoglobulin','lactose','ghee','kefir','quark','curd','half and half','sour cream','ice cream','custard'],
    affects: ['milk allergy','lactose intolerance'],
    alternatives: ['oat milk','almond milk','soy milk','coconut milk','rice milk','dairy-free cheese'],
  },
  nuts: {
    severity: 'critical',
    description: 'Tree nuts including almond, cashew, walnut, pecan',
    triggers: ['almond','almonds','cashew','cashews','walnut','walnuts','pecan','pecans','pistachio','pistachios','brazil nut','hazelnut','hazelnuts','macadamia','pine nut','chestnut','marzipan','praline','nut oil','nut extract'],
    affects: ['tree nut allergy (anaphylaxis risk)'],
    alternatives: ['seeds (sunflower, pumpkin)','roasted chickpeas'],
  },
  celery: {
    severity: 'moderate',
    description: 'Celery stalks, leaves, seeds, and celeriac',
    triggers: ['celery','celeriac','celery salt','celery seed','celery powder'],
    affects: ['celery allergy'],
    alternatives: ['fennel','leek','zucchini'],
  },
  mustard: {
    severity: 'moderate',
    description: 'Mustard plants including seeds, leaves, flowers',
    triggers: ['mustard','mustard seed','mustard powder','mustard oil','mustard leaves','dijon','yellow mustard','brown mustard'],
    affects: ['mustard allergy'],
    alternatives: ['turmeric (for color)','wasabi (check tolerance)'],
  },
  sesame: {
    severity: 'high',
    description: 'Sesame seeds and sesame-derived products',
    triggers: ['sesame','sesame seed','tahini','sesame oil','sesame flour','gingelly','til','benne','sesame paste','hummus'],
    affects: ['sesame allergy'],
    alternatives: ['sunflower seeds','pumpkin seeds','hemp seeds'],
  },
  sulphites: {
    severity: 'moderate',
    description: 'Sulphur dioxide and sulphites (>10mg/kg)',
    triggers: ['sulphite','sulfite','sulphur dioxide','sulfur dioxide','sodium bisulfite','potassium bisulfite','sodium metabisulfite','potassium metabisulfite','e220','e221','e222','e223','e224','e225','e226','e227','e228','dried fruit','wine vinegar'],
    affects: ['sulphite sensitivity','asthma'],
    alternatives: ['fresh fruit','lemon juice (natural preservative)'],
  },
  lupin: {
    severity: 'high',
    description: 'Lupin flour and seeds (cross-reactive with peanuts)',
    triggers: ['lupin','lupine','lupin flour','lupin bean','lupin seed'],
    affects: ['lupin allergy','peanut cross-reactivity'],
    alternatives: ['chickpea flour','rice flour'],
  },
  molluscs: {
    severity: 'high',
    description: 'Molluscs including oysters, clams, squid, scallops',
    triggers: ['oyster','oysters','clam','clams','scallop','scallops','squid','octopus','mussel','mussels','abalone','snail','escargot','oyster sauce','clam juice'],
    affects: ['mollusc allergy'],
    alternatives: ['plant-based seafood','mushrooms for umami flavor'],
  },
  // US-specific additions
  corn: {
    severity: 'moderate',
    description: 'Corn and corn-derived ingredients',
    triggers: ['corn','maize','cornstarch','corn syrup','high fructose corn syrup','corn flour','cornmeal','popcorn','hominy','grits','polenta','corn oil','dextrose (often from corn)'],
    affects: ['corn allergy'],
    alternatives: ['potato starch','arrowroot','tapioca'],
  },
  nightshades: {
    severity: 'low',
    description: 'Nightshade vegetables (tomato, pepper, eggplant)',
    triggers: ['tomato','tomatoes','potato','peppers','eggplant','aubergine','paprika','cayenne','goji berry','ashwagandha','tobacco'],
    affects: ['nightshade sensitivity','autoimmune protocol'],
    alternatives: ['sweet potato','beets','carrots','zucchini'],
  },
};

// ── Parse ingredient list ────────────────────────────────────────────────────
function parseIngredients(input) {
  if (Array.isArray(input)) return input.map(i => String(i).toLowerCase().trim());
  return String(input).toLowerCase()
    .split(/[,;()\n]+/)
    .map(i => i.trim())
    .filter(i => i.length > 1);
}

// ── Scan ingredients against allergens ─────────────────────────────────────
function scanAllergens(ingredients, checkList) {
  const detected = [];
  const clean = ingredients.join(' ');

  for (const [allergen, info] of Object.entries(ALLERGEN_TRIGGERS)) {
    if (checkList && !checkList.includes(allergen)) continue;
    const matched = info.triggers.filter(t => clean.includes(t));
    if (matched.length) {
      detected.push({
        allergen,
        severity: info.severity,
        description: info.description,
        matched_ingredients: [...new Set(matched)],
        affects: info.affects,
      });
    }
  }

  return detected.sort((a, b) => {
    const order = { critical:0, high:1, moderate:2, low:3 };
    return order[a.severity] - order[b.severity];
  });
}

// ── Dietary suitability ──────────────────────────────────────────────────────
function checkDietarySuitability(detected) {
  const allergenSet = new Set(detected.map(d => d.allergen));
  return {
    vegan:        !allergenSet.has('eggs') && !allergenSet.has('milk') && !allergenSet.has('fish') && !allergenSet.has('crustaceans') && !allergenSet.has('molluscs'),
    vegetarian:   !allergenSet.has('fish') && !allergenSet.has('crustaceans') && !allergenSet.has('molluscs'),
    gluten_free:  !allergenSet.has('gluten'),
    dairy_free:   !allergenSet.has('milk'),
    nut_free:     !allergenSet.has('nuts') && !allergenSet.has('peanuts'),
    egg_free:     !allergenSet.has('eggs'),
    soy_free:     !allergenSet.has('soybeans'),
    sesame_free:  !allergenSet.has('sesame'),
    pescatarian:  !allergenSet.has('crustaceans'),
    keto_compat:  !allergenSet.has('gluten') && !allergenSet.has('corn'),
  };
}

// ── Main route ───────────────────────────────────────────────────────────────
app.post('/api/food-allergen-checker', (req, res) => {
  const plan = getPlan(req);
  const { ingredients, recipe_name, check_allergens } = { ...req.query, ...req.body };

  if (!ingredients) {
    return errorResponse(res, 400, 'Provide "ingredients" as a string (comma-separated) or array');
  }

  const parsed    = parseIngredients(ingredients);
  const checkList = check_allergens
    ? (Array.isArray(check_allergens) ? check_allergens : String(check_allergens).split(',').map(s => s.trim()))
    : null;

  const detected  = scanAllergens(parsed, checkList);
  const critical  = detected.filter(d => d.severity === 'critical').map(d => d.allergen);
  const high      = detected.filter(d => d.severity === 'high').map(d => d.allergen);

  const response = {
    success: true,
    analyzed_at: new Date().toISOString(),
    recipe_name: recipe_name || 'Unknown Recipe',
    ingredients_scanned: parsed.length,
    allergens_found: detected.length,
    highest_severity: detected[0]?.severity || 'none',
    critical_allergens: critical,
    high_risk_allergens: high,
    safe_label: detected.length === 0 ? 'No major allergens detected' : `Contains: ${detected.map(d => d.allergen).join(', ')}`,
    plan,
  };

  if (plan === 'free') {
    response.allergens = detected.map(d => ({ allergen: d.allergen, severity: d.severity }));
    return res.json(response);
  }

  response.allergens = detected;
  response.dietary_suitability = checkDietarySuitability(detected);
  response.ingredients_parsed = parsed;

  if (plan === 'ultra' || plan === 'mega') {
    response.alternatives = detected.reduce((acc, d) => {
      acc[d.allergen] = ALLERGEN_TRIGGERS[d.allergen]?.alternatives || [];
      return acc;
    }, {});
    response.cross_contamination_risks = detected
      .filter(d => ['critical','high'].includes(d.severity))
      .map(d => ({
        allergen: d.allergen,
        risk: 'Verify manufacturing facility for cross-contamination',
        action: d.severity === 'critical' ? 'AVOID — anaphylaxis risk' : 'Caution advised',
      }));
    response.eu_label_required = detected.filter(d => d.allergen !== 'corn' && d.allergen !== 'nightshades').map(d => d.allergen);
  }

  res.json(response);
});

if (require.main === module) {
  const PORT = process.env.PORT || 3023;
  app.listen(PORT, () => console.log(`food-allergen-checker running on port ${PORT}`));
}
module.exports = app;
