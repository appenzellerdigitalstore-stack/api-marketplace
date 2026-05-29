/**
 * /api/meal-planner
 * Generate personalized weekly meal plans based on dietary goals,
 * calorie targets, restrictions, and cuisine preferences.
 * Returns structured daily meals with nutrition totals.
 */
'use strict';

const express = require('express');
const { getPlan } = require('../shared/planFilter');
const { errorResponse } = require('../shared/utils');

const app = express();
app.use(express.json({ strict: false, type: () => true }));
app.use(express.urlencoded({ extended: true }));

// ── Meal templates database ─────────────────────────────────────────────────
const MEALS = {
  breakfast: [
    { name:'Oatmeal with Berries & Honey',         cal:320, p:12, c:58, f:6,  tags:['vegan','gluten-free-opt','vegetarian','high-fiber'], cuisine:'western' },
    { name:'Scrambled Eggs with Spinach & Toast',  cal:380, p:22, c:32, f:16, tags:['vegetarian','high-protein'],                         cuisine:'western' },
    { name:'Greek Yogurt Parfait with Granola',    cal:350, p:18, c:48, f:8,  tags:['vegetarian','high-protein'],                         cuisine:'western' },
    { name:'Avocado Toast with Poached Eggs',      cal:420, p:18, c:38, f:22, tags:['vegetarian','keto-low'],                             cuisine:'western' },
    { name:'Smoothie Bowl (Acai, Banana, Hemp)',   cal:410, p:14, c:68, f:10, tags:['vegan','gluten-free'],                               cuisine:'western' },
    { name:'Chia Seed Pudding with Mango',         cal:290, p:10, c:42, f:11, tags:['vegan','gluten-free','high-fiber'],                  cuisine:'western' },
    { name:'Protein Pancakes with Maple Syrup',    cal:445, p:26, c:55, f:12, tags:['vegetarian','high-protein'],                         cuisine:'western' },
    { name:'Miso Soup with Tofu & Rice',           cal:280, p:14, c:42, f:6,  tags:['vegan','gluten-free'],                               cuisine:'japanese' },
    { name:'Shakshuka (Eggs in Tomato Sauce)',     cal:360, p:20, c:24, f:18, tags:['vegetarian','gluten-free','keto-low'],               cuisine:'mediterranean' },
    { name:'Overnight Oats with Almond Butter',   cal:440, p:16, c:62, f:16, tags:['vegan','high-fiber'],                               cuisine:'western' },
  ],
  lunch: [
    { name:'Grilled Chicken Caesar Salad',         cal:480, p:38, c:22, f:28, tags:['gluten-free','high-protein','keto-low'],             cuisine:'western' },
    { name:'Quinoa & Roasted Vegetable Bowl',      cal:420, p:14, c:62, f:14, tags:['vegan','gluten-free','high-fiber'],                  cuisine:'western' },
    { name:'Turkey & Avocado Wrap',                cal:510, p:34, c:44, f:22, tags:['high-protein'],                                     cuisine:'western' },
    { name:'Lentil & Vegetable Soup',              cal:320, p:18, c:52, f:4,  tags:['vegan','gluten-free','high-fiber','high-protein'],   cuisine:'mediterranean' },
    { name:'Sushi Bowl with Salmon & Edamame',     cal:490, p:30, c:58, f:14, tags:['gluten-free','high-protein'],                       cuisine:'japanese' },
    { name:'Chicken Burrito Bowl',                 cal:560, p:42, c:58, f:18, tags:['gluten-free','high-protein'],                       cuisine:'mexican' },
    { name:'Mediterranean Falafel Plate',          cal:450, p:16, c:54, f:20, tags:['vegan','vegetarian'],                               cuisine:'mediterranean' },
    { name:'Thai Peanut Noodle Salad',             cal:480, p:18, c:62, f:18, tags:['vegan'],                                            cuisine:'thai' },
    { name:'Tuna Nicoise Salad',                   cal:390, p:32, c:20, f:18, tags:['gluten-free','keto-low','high-protein'],             cuisine:'french' },
    { name:'Black Bean & Sweet Potato Tacos',      cal:440, p:16, c:68, f:12, tags:['vegan','vegetarian','high-fiber'],                  cuisine:'mexican' },
  ],
  dinner: [
    { name:'Baked Salmon with Asparagus & Quinoa',cal:520, p:42, c:38, f:18, tags:['gluten-free','high-protein','keto-low'],             cuisine:'western' },
    { name:'Chicken Stir Fry with Brown Rice',     cal:540, p:40, c:58, f:12, tags:['gluten-free','high-protein'],                       cuisine:'asian' },
    { name:'Beef & Broccoli with Cauliflower Rice',cal:430, p:38, c:18, f:24, tags:['gluten-free','keto','high-protein'],                cuisine:'asian' },
    { name:'Pasta Primavera with Marinara',        cal:480, p:16, c:72, f:12, tags:['vegan','vegetarian'],                               cuisine:'italian' },
    { name:'Lamb & Vegetable Curry with Rice',     cal:580, p:34, c:52, f:22, tags:['gluten-free','high-protein'],                       cuisine:'indian' },
    { name:'Grilled Tofu & Vegetable Skewers',     cal:360, p:22, c:28, f:18, tags:['vegan','gluten-free','vegetarian'],                 cuisine:'mediterranean' },
    { name:'Shrimp Tacos with Mango Salsa',        cal:490, p:30, c:52, f:16, tags:['gluten-free','high-protein'],                       cuisine:'mexican' },
    { name:'Mushroom Risotto with Parmesan',       cal:520, p:16, c:68, f:20, tags:['vegetarian'],                                       cuisine:'italian' },
    { name:'Turkey Meatball Zucchini Noodles',     cal:380, p:36, c:16, f:18, tags:['gluten-free','high-protein','keto-low'],            cuisine:'italian' },
    { name:'Chickpea & Spinach Tikka Masala',      cal:440, p:18, c:52, f:16, tags:['vegan','gluten-free','high-fiber'],                 cuisine:'indian' },
  ],
  snack: [
    { name:'Apple with Almond Butter',             cal:200, p:5,  c:28, f:9,  tags:['vegan','gluten-free'],                             cuisine:'western' },
    { name:'Hummus & Vegetable Sticks',            cal:180, p:7,  c:22, f:8,  tags:['vegan','gluten-free','high-fiber'],                cuisine:'mediterranean' },
    { name:'Greek Yogurt with Walnuts',            cal:220, p:14, c:16, f:11, tags:['vegetarian','high-protein'],                       cuisine:'western' },
    { name:'Protein Bar (Chocolate Peanut)',       cal:240, p:20, c:26, f:8,  tags:['high-protein'],                                   cuisine:'western' },
    { name:'Mixed Nuts & Dried Fruit',             cal:280, p:8,  c:28, f:18, tags:['vegan','gluten-free'],                             cuisine:'western' },
    { name:'Edamame with Sea Salt',                cal:150, p:12, c:14, f:6,  tags:['vegan','gluten-free','high-protein'],              cuisine:'japanese' },
    { name:'Cottage Cheese with Pineapple',        cal:190, p:16, c:22, f:3,  tags:['vegetarian','high-protein'],                      cuisine:'western' },
    { name:'Rice Cakes with Avocado',              cal:170, p:3,  c:24, f:8,  tags:['vegan','gluten-free'],                            cuisine:'western' },
  ],
};

// ── Helper: filter meals by dietary restrictions ─────────────────────────────
function filterMeals(mealType, restrictions = [], preferences = []) {
  let pool = [...MEALS[mealType]];
  if (restrictions.length) {
    pool = pool.filter(m => restrictions.every(r => m.tags.some(t => t.includes(r.toLowerCase()))));
  }
  if (preferences.length) {
    const preferred = pool.filter(m => preferences.some(p => m.cuisine === p.toLowerCase() || m.tags.includes(p.toLowerCase())));
    if (preferred.length >= 2) pool = preferred;
  }
  return pool;
}

// ── Generate one day of meals ────────────────────────────────────────────────
function generateDay(dayNum, targetCalories, restrictions, preferences, includeSnacks, usedMeals) {
  const pick = (type) => {
    const pool = filterMeals(type, restrictions, preferences).filter(m => !usedMeals.has(m.name));
    if (!pool.length) return filterMeals(type, restrictions, preferences)[dayNum % 3];
    const meal = pool[dayNum % pool.length];
    usedMeals.add(meal.name);
    return meal;
  };

  const breakfast = pick('breakfast');
  const lunch     = pick('lunch');
  const dinner    = pick('dinner');
  const snack     = includeSnacks ? pick('snack') : null;

  const dayCalories = breakfast.cal + lunch.cal + dinner.cal + (snack ? snack.cal : 0);
  const calorieAdj  = targetCalories ? Math.round((dayCalories / targetCalories - 1) * 100) : 0;

  const meals = [
    { type:'breakfast', ...breakfast },
    { type:'lunch',     ...lunch },
    { type:'dinner',    ...dinner },
    ...(snack ? [{ type:'snack', ...snack }] : []),
  ];

  return {
    day: dayNum,
    meals,
    daily_totals: {
      calories: dayCalories,
      protein_g: meals.reduce((a, m) => a + m.p, 0),
      carbs_g:   meals.reduce((a, m) => a + m.c, 0),
      fat_g:     meals.reduce((a, m) => a + m.f, 0),
    },
    calorie_vs_target_pct: calorieAdj,
  };
}

// ── Main route ───────────────────────────────────────────────────────────────
app.post('/api/meal-planner', (req, res) => {
  const plan = getPlan(req);
  const {
    days = 7,
    calories = 2000,
    goal = 'maintain',         // lose | gain | maintain
    restrictions = [],         // vegan | vegetarian | gluten-free | keto | high-protein
    preferences = [],          // cuisine types
    include_snacks = true,
  } = { ...req.query, ...req.body };

  const numDays     = Math.min(parseInt(days) || 7, plan === 'free' ? 3 : plan === 'pro' ? 7 : 14);
  const targetCals  = parseInt(calories) || 2000;
  const rest        = Array.isArray(restrictions) ? restrictions : String(restrictions).split(',').map(s => s.trim()).filter(Boolean);
  const prefs       = Array.isArray(preferences)  ? preferences  : String(preferences).split(',').map(s => s.trim()).filter(Boolean);
  const snacks      = include_snacks === true || include_snacks === 'true';

  // Adjust calories for goal
  const goalAdjust  = goal === 'lose' ? -300 : goal === 'gain' ? 300 : 0;
  const adjCals     = targetCals + goalAdjust;

  const usedMeals = new Set();
  const weekPlan  = [];

  for (let d = 1; d <= numDays; d++) {
    weekPlan.push(generateDay(d, adjCals, rest, prefs, snacks, usedMeals));
  }

  const avgCals = Math.round(weekPlan.reduce((a, d) => a + d.daily_totals.calories, 0) / weekPlan.length);

  const response = {
    success: true,
    generated_at: new Date().toISOString(),
    plan_summary: {
      days: numDays,
      goal,
      target_calories: adjCals,
      avg_actual_calories: avgCals,
      restrictions: rest,
      preferences: prefs,
    },
    days: weekPlan,
    plan,
  };

  if (plan !== 'free') {
    const allNutrients = weekPlan.map(d => d.daily_totals);
    response.weekly_totals = {
      calories:  allNutrients.reduce((a, n) => a + n.calories, 0),
      protein_g: allNutrients.reduce((a, n) => a + n.protein_g, 0),
      carbs_g:   allNutrients.reduce((a, n) => a + n.carbs_g, 0),
      fat_g:     allNutrients.reduce((a, n) => a + n.fat_g, 0),
    };
    response.shopping_list = buildShoppingList(weekPlan);
  }

  if (plan === 'ultra' || plan === 'mega') {
    response.nutrition_insights = generateInsights(weekPlan, adjCals, goal);
  }

  res.json(response);
});

function buildShoppingList(weekPlan) {
  const allMeals = weekPlan.flatMap(d => d.meals);
  const counts = {};
  allMeals.forEach(m => { counts[m.name] = (counts[m.name] || 0) + 1; });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([meal, count]) => ({ meal, servings: count }));
}

function generateInsights(weekPlan, targetCals, goal) {
  const avg = weekPlan.reduce((a, d) => ({
    cal: a.cal + d.daily_totals.calories / weekPlan.length,
    prot: a.prot + d.daily_totals.protein_g / weekPlan.length,
  }), { cal: 0, prot: 0 });

  const insights = [];
  if (avg.prot < 50) insights.push({ type: 'warning', message: 'Average daily protein is below recommended 50g. Consider adding more lean proteins.' });
  if (avg.cal > targetCals * 1.1) insights.push({ type: 'info', message: 'Average calories exceed target by more than 10%. Review portion sizes.' });
  if (goal === 'lose' && avg.cal < targetCals * 0.85) insights.push({ type: 'warning', message: 'Calorie deficit may be too aggressive. Ensure minimum 1200 cal/day.' });
  if (insights.length === 0) insights.push({ type: 'success', message: 'Meal plan meets nutritional targets. Great balance of macros.' });
  return insights;
}

if (require.main === module) {
  const PORT = process.env.PORT || 3022;
  app.listen(PORT, () => console.log(`meal-planner running on port ${PORT}`));
}
module.exports = app;
