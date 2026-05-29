/**
 * /api/nutrition-analyzer
 * Analyze any food item, recipe, or ingredient list and return full
 * nutritional breakdown: macros, micros, vitamins, minerals, glycemic index,
 * allergen flags, and dietary compatibility (keto/vegan/halal/etc.)
 */
'use strict';

const express = require('express');
const { getPlan } = require('../shared/planFilter');
const { errorResponse } = require('../shared/utils');

const app = express();
app.use(express.json({ strict: false, type: () => true }));
app.use(express.urlencoded({ extended: true }));

// ── Embedded nutrition database (per 100g) ─────────────────────────────────
const FOOD_DB = {
  // Proteins
  'chicken breast': { calories:165, protein:31, carbs:0, fat:3.6, fiber:0, sugar:0, sodium:74, potassium:256, calcium:15, iron:1.0, vitC:0, vitA:9, vitB12:0.3, gi:0, category:'protein' },
  'salmon':         { calories:208, protein:20, carbs:0, fat:13,  fiber:0, sugar:0, sodium:59,  potassium:363, calcium:12, iron:0.8, vitC:3,  vitA:40,vitB12:3.2,gi:0, category:'protein' },
  'egg':            { calories:155, protein:13, carbs:1.1,fat:11, fiber:0, sugar:1.1,sodium:124, potassium:126, calcium:56, iron:1.8, vitC:0,  vitA:149,vitB12:1.1,gi:0, category:'protein' },
  'tofu':           { calories:76,  protein:8,  carbs:1.9,fat:4.8,fiber:0.3,sugar:0.7,sodium:7, potassium:121, calcium:350,iron:5.4, vitC:0.1,vitA:0,  vitB12:0,  gi:15,category:'protein' },
  'beef':           { calories:250, protein:26, carbs:0,  fat:17, fiber:0, sugar:0, sodium:72,  potassium:318, calcium:18, iron:2.6, vitC:0,  vitA:0,  vitB12:2.5,gi:0, category:'protein' },
  // Grains
  'rice':           { calories:130, protein:2.7,carbs:28, fat:0.3,fiber:0.4,sugar:0, sodium:1,   potassium:35,  calcium:10, iron:0.2, vitC:0,  vitA:0,  vitB12:0,  gi:73,category:'grain' },
  'oats':           { calories:389, protein:17, carbs:66, fat:7,  fiber:11, sugar:1, sodium:2,   potassium:429, calcium:54, iron:4.7, vitC:0,  vitA:0,  vitB12:0,  gi:55,category:'grain' },
  'bread':          { calories:265, protein:9,  carbs:49, fat:3.2,fiber:2.7,sugar:5, sodium:491, potassium:115, calcium:260,iron:3.6, vitC:0,  vitA:0,  vitB12:0,  gi:70,category:'grain' },
  'pasta':          { calories:131, protein:5,  carbs:25, fat:1.1,fiber:1.8,sugar:0.6,sodium:1,  potassium:44,  calcium:7,  iron:0.5, vitC:0,  vitA:0,  vitB12:0,  gi:50,category:'grain' },
  'quinoa':         { calories:120, protein:4.4,carbs:22, fat:1.9,fiber:2.8,sugar:0.9,sodium:7,  potassium:172, calcium:17, iron:1.5, vitC:0,  vitA:0,  vitB12:0,  gi:53,category:'grain' },
  // Vegetables
  'broccoli':       { calories:34,  protein:2.8,carbs:7,  fat:0.4,fiber:2.6,sugar:1.7,sodium:33, potassium:316, calcium:47, iron:0.7, vitC:89, vitA:31, vitB12:0,  gi:10,category:'vegetable' },
  'spinach':        { calories:23,  protein:2.9,carbs:3.6,fat:0.4,fiber:2.2,sugar:0.4,sodium:79, potassium:558, calcium:99, iron:2.7, vitC:28, vitA:469,vitB12:0,  gi:15,category:'vegetable' },
  'carrot':         { calories:41,  protein:0.9,carbs:10, fat:0.2,fiber:2.8,sugar:4.7,sodium:69, potassium:320, calcium:33, iron:0.3, vitC:6,  vitA:835,vitB12:0,  gi:35,category:'vegetable' },
  'sweet potato':   { calories:86,  protein:1.6,carbs:20, fat:0.1,fiber:3,  sugar:4.2,sodium:55, potassium:337, calcium:30, iron:0.6, vitC:2.4,vitA:961,vitB12:0,  gi:63,category:'vegetable' },
  'tomato':         { calories:18,  protein:0.9,carbs:3.9,fat:0.2,fiber:1.2,sugar:2.6,sodium:5,  potassium:237, calcium:10, iron:0.3, vitC:14, vitA:42, vitB12:0,  gi:15,category:'vegetable' },
  // Fruits
  'banana':         { calories:89,  protein:1.1,carbs:23, fat:0.3,fiber:2.6,sugar:12, sodium:1,  potassium:358, calcium:5,  iron:0.3, vitC:8.7,vitA:3,  vitB12:0,  gi:51,category:'fruit' },
  'apple':          { calories:52,  protein:0.3,carbs:14, fat:0.2,fiber:2.4,sugar:10, sodium:1,  potassium:107, calcium:6,  iron:0.1, vitC:4.6,vitA:3,  vitB12:0,  gi:36,category:'fruit' },
  'blueberries':    { calories:57,  protein:0.7,carbs:14, fat:0.3,fiber:2.4,sugar:10, sodium:1,  potassium:77,  calcium:6,  iron:0.3, vitC:9.7,vitA:3,  vitB12:0,  gi:53,category:'fruit' },
  'avocado':        { calories:160, protein:2,  carbs:9,  fat:15, fiber:7,  sugar:0.7,sodium:7,  potassium:485, calcium:12, iron:0.6, vitC:10, vitA:7,  vitB12:0,  gi:10,category:'fruit' },
  'orange':         { calories:47,  protein:0.9,carbs:12, fat:0.1,fiber:2.4,sugar:9.4,sodium:0,  potassium:181, calcium:40, iron:0.1, vitC:53, vitA:11, vitB12:0,  gi:40,category:'fruit' },
  // Dairy
  'milk':           { calories:61,  protein:3.2,carbs:4.8,fat:3.3,fiber:0, sugar:5.1,sodium:43, potassium:150, calcium:113,iron:0.03,vitC:0,  vitA:46, vitB12:0.4,gi:27,category:'dairy' },
  'yogurt':         { calories:59,  protein:3.5,carbs:5,  fat:3.3,fiber:0, sugar:5,  sodium:36, potassium:141, calcium:121,iron:0.05,vitC:0.5,vitA:27, vitB12:0.4,gi:36,category:'dairy' },
  'cheese':         { calories:402, protein:25, carbs:1.3,fat:33, fiber:0, sugar:0.5,sodium:621,potassium:98,  calcium:721,iron:0.7, vitC:0,  vitA:265,vitB12:1.1,gi:0, category:'dairy' },
  // Nuts & Legumes
  'almonds':        { calories:579, protein:21, carbs:22, fat:50, fiber:13, sugar:4.4,sodium:1,  potassium:733, calcium:264,iron:3.7, vitC:0,  vitA:0,  vitB12:0,  gi:0, category:'nut' },
  'lentils':        { calories:116, protein:9,  carbs:20, fat:0.4,fiber:8,  sugar:1.8,sodium:2,  potassium:369, calcium:19, iron:3.3, vitC:1.5,vitA:1,  vitB12:0,  gi:29,category:'legume' },
  'chickpeas':      { calories:164, protein:9,  carbs:27, fat:2.6,fiber:8,  sugar:4.8,sodium:7,  potassium:291, calcium:49, iron:2.9, vitC:1.3,vitA:0,  vitB12:0,  gi:28,category:'legume' },
  // Oils & Fats
  'olive oil':      { calories:884, protein:0,  carbs:0,  fat:100,fiber:0, sugar:0,  sodium:2,  potassium:1,   calcium:1,  iron:0.6, vitC:0,  vitA:0,  vitB12:0,  gi:0, category:'fat' },
  'butter':         { calories:717, protein:0.9,carbs:0.1,fat:81, fiber:0, sugar:0.1,sodium:576,potassium:24,  calcium:24, iron:0,   vitC:0,  vitA:684,vitB12:0.2,gi:0, category:'fat' },
};

// ── Allergen mapping ────────────────────────────────────────────────────────
const ALLERGEN_MAP = {
  gluten:     ['bread','pasta','oats','wheat','barley','rye'],
  dairy:      ['milk','cheese','yogurt','butter','cream','whey'],
  eggs:       ['egg','eggs','mayonnaise'],
  nuts:       ['almonds','peanuts','cashews','walnuts','pecans','pistachios'],
  soy:        ['tofu','soy','edamame','miso','tempeh'],
  shellfish:  ['shrimp','crab','lobster','crayfish','scallops'],
  fish:       ['salmon','tuna','cod','tilapia','bass','trout'],
  sesame:     ['sesame','tahini','hummus'],
};

// ── Dietary compatibility ───────────────────────────────────────────────────
function checkDietary(item, nutrient) {
  const cat = nutrient.category;
  return {
    vegan:         !['protein','dairy'].includes(cat) || ['tofu','lentils','chickpeas','quinoa'].includes(item),
    vegetarian:    !['protein'].includes(cat) || ['egg','tofu','salmon'].includes(item) || cat === 'protein' && ['egg','tofu'].includes(item),
    keto:          nutrient.carbs < 5,
    paleo:         !['grain','dairy','legume'].includes(cat),
    halal:         !['pork','alcohol','lard'].includes(item),
    gluten_free:   !ALLERGEN_MAP.gluten.some(a => item.includes(a)),
    low_gi:        nutrient.gi < 55,
  };
}

// ── Fuzzy match food name ───────────────────────────────────────────────────
function findFood(query) {
  const q = query.toLowerCase().trim();
  if (FOOD_DB[q]) return { key: q, data: FOOD_DB[q], confidence: 1.0 };
  // Partial match
  for (const [key, data] of Object.entries(FOOD_DB)) {
    if (key.includes(q) || q.includes(key)) return { key, data, confidence: 0.8 };
  }
  // Word overlap
  const words = q.split(/\s+/);
  for (const [key, data] of Object.entries(FOOD_DB)) {
    if (words.some(w => key.includes(w) && w.length > 3)) return { key, data, confidence: 0.6 };
  }
  return null;
}

// ── Scale nutrients by grams ────────────────────────────────────────────────
function scale(nutrient, grams) {
  const factor = grams / 100;
  return {
    calories:   Math.round(nutrient.calories * factor),
    protein_g:  +(nutrient.protein * factor).toFixed(1),
    carbs_g:    +(nutrient.carbs * factor).toFixed(1),
    fat_g:      +(nutrient.fat * factor).toFixed(1),
    fiber_g:    +(nutrient.fiber * factor).toFixed(1),
    sugar_g:    +(nutrient.sugar * factor).toFixed(1),
    sodium_mg:  Math.round(nutrient.sodium * factor),
    potassium_mg: Math.round(nutrient.potassium * factor),
    calcium_mg: Math.round(nutrient.calcium * factor),
    iron_mg:    +(nutrient.iron * factor).toFixed(2),
    vitamin_c_mg: +(nutrient.vitC * factor).toFixed(1),
    vitamin_a_mcg: Math.round(nutrient.vitA * factor),
    vitamin_b12_mcg: +(nutrient.vitB12 * factor).toFixed(2),
  };
}

// ── Calculate health scores ─────────────────────────────────────────────────
function healthScore(nutrient, grams) {
  const n = scale(nutrient, grams);
  let score = 50;
  if (n.fiber_g >= 3) score += 10;
  if (n.protein_g >= 10) score += 10;
  if (n.fat_g < 5) score += 5;
  if (n.sodium_mg < 200) score += 5;
  if (n.vitamin_c_mg >= 10) score += 10;
  if (n.sugar_g > 15) score -= 10;
  if (n.sodium_mg > 500) score -= 10;
  if (nutrient.gi > 70) score -= 10;
  return Math.min(100, Math.max(0, score));
}

// ── Main route ──────────────────────────────────────────────────────────────
app.post('/api/nutrition-analyzer', (req, res) => {
  const plan = getPlan(req);
  const { food, ingredients, grams = 100, serving_size } = { ...req.query, ...req.body };

  if (!food && !ingredients) {
    return errorResponse(res, 400, 'Provide "food" (string) or "ingredients" (array)');
  }

  const servingGrams = parseFloat(grams) || parseFloat(serving_size) || 100;
  const items = ingredients
    ? (Array.isArray(ingredients) ? ingredients : String(ingredients).split(',').map(s => s.trim()))
    : [String(food)];

  const results = [];
  let totals = { calories:0, protein_g:0, carbs_g:0, fat_g:0, fiber_g:0, sugar_g:0, sodium_mg:0 };
  const allergens_detected = new Set();

  for (const item of items.slice(0, plan === 'free' ? 3 : plan === 'pro' ? 10 : 25)) {
    const match = findFood(item);
    if (!match) {
      results.push({ item, found: false, message: 'Not found in database' });
      continue;
    }

    const nutrients = scale(match.data, servingGrams);
    Object.keys(totals).forEach(k => { totals[k] = +(totals[k] + (nutrients[k] || 0)).toFixed(1); });

    // Detect allergens
    for (const [allergen, foods] of Object.entries(ALLERGEN_MAP)) {
      if (foods.some(f => match.key.includes(f))) allergens_detected.add(allergen);
    }

    const entry = {
      item: match.key,
      query: item,
      match_confidence: match.confidence,
      serving_grams: servingGrams,
      nutrients,
      glycemic_index: match.data.gi,
      glycemic_load: +(match.data.gi * nutrients.carbs_g / 100).toFixed(1),
    };

    if (plan !== 'free') {
      entry.dietary = checkDietary(match.key, match.data);
      entry.health_score = healthScore(match.data, servingGrams);
      entry.category = match.data.category;
    }
    if (plan === 'ultra' || plan === 'mega') {
      entry.daily_value_pct = {
        calories:   Math.round(nutrients.calories / 2000 * 100),
        protein:    Math.round(nutrients.protein_g / 50 * 100),
        carbs:      Math.round(nutrients.carbs_g / 275 * 100),
        fat:        Math.round(nutrients.fat_g / 78 * 100),
        fiber:      Math.round(nutrients.fiber_g / 28 * 100),
        sodium:     Math.round(nutrients.sodium_mg / 2300 * 100),
        vitamin_c:  Math.round(nutrients.vitamin_c_mg / 90 * 100),
        calcium:    Math.round(nutrients.calcium_mg / 1300 * 100),
        iron:       Math.round(nutrients.iron_mg / 18 * 100),
      };
    }

    results.push(entry);
  }

  const response = {
    success: true,
    analyzed_at: new Date().toISOString(),
    serving_grams: servingGrams,
    items_analyzed: results.length,
    items: results,
    totals,
    allergens_detected: [...allergens_detected],
    plan,
  };

  if (plan !== 'free') {
    response.overall_health_score = Math.min(100, Math.round(
      results.filter(r => r.health_score).reduce((a, r) => a + r.health_score, 0) /
      Math.max(1, results.filter(r => r.health_score).length)
    ));
    response.macros_pct = {
      protein: Math.round(totals.protein_g * 4 / Math.max(1, totals.calories) * 100),
      carbs:   Math.round(totals.carbs_g * 4 / Math.max(1, totals.calories) * 100),
      fat:     Math.round(totals.fat_g * 9 / Math.max(1, totals.calories) * 100),
    };
  }

  res.json(response);
});

if (require.main === module) {
  const PORT = process.env.PORT || 3021;
  app.listen(PORT, () => console.log(`nutrition-analyzer running on port ${PORT}`));
}
module.exports = app;
