// "How your plan is made", English (source). The engine's principles (engine/principles.js) in plain
// words for the people using the site, in the same order and keyed by the same ids, so a test can
// check the page still matches the engine. Change both together.
export default {
  title: 'How your plan is made',
  intro: 'Every plan on Make It Stretch follows the same rules, in this order. When two rules pull against each other, the one higher on the list wins. Every plan is checked against them.',
  items: [
    { id: 'cookable', h: 'You can cook every meal from your list', p: 'Every meal uses only what’s on your shopping list, plus salt, water and cinnamon and anything you told us you already have.' },
    { id: 'within_budget', h: 'Your list fits your budget', p: 'The shopping list never costs more than the amount you entered.' },
    { id: 'calories_first', h: 'Enough food comes first', p: 'We aim for about 2,000 calories a day for each person, the amount U.S. dietary guidelines use. Until a plan gets there, money goes to the most filling food for the price before anything else.' },
    { id: 'fullness_next', h: 'Food that keeps you full', p: 'When two meals cost about the same, we pick the one that keeps you full longer: more protein, fiber and water.' },
    { id: 'guidance', h: 'Healthy when the budget allows', p: 'At or above the average SNAP benefit (about $6.22 a person a day), each person gets enough protein and fiber, a fruit and two servings of vegetables a day, following federal nutrition guidance.' },
    { id: 'variety', h: 'Different meals from the same groceries', p: 'We look for different meals that use food already on your list, so variety costs little or nothing. We only give up a little food (at most 1 calorie in 10) to make the week more varied, and the same meal won’t show up two days in a row when there’s another choice.' },
    { id: 'spread', h: 'No one food takes over', p: 'Apart from basics like rice, beans, oil, onions and garlic, no food shows up in more than about 1 in 4 meals. If the budget can’t allow that, the plan tells you.' },
    { id: 'household', h: 'Made for your household', p: 'Every amount is for the number of people you chose. Foods you leave out and diets you follow are always respected.' },
    { id: 'no_piles', h: 'No piles of one food', p: 'We only buy what your meals use. If money is left over, we show it to you instead of spending it on more of one food.' },
    { id: 'honest', h: 'Honest when money is short', p: 'Your plan says how many days it covers and about how many calories a day it gives, counting food left in the packages you buy. When the money can’t cover it, we point you to free food near you and to SNAP.' },
    { id: 'same_plan', h: 'The same answers, the same plan', p: 'There’s no guessing or randomness. The same answers always give the same plan, so you can share it, print it or check it.' },
  ],
  back: 'Make a plan',
};
