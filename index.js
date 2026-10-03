import fs from 'node:fs/promises';
import { Command } from 'commander';

const program = new Command();

/**
 * Читання та безпечний парсинг JSON-файлу
 * @param {string} filePath - шлях до файлу
 * @returns {Promise<Object>} розпарсений JSON
 */
async function loadData(filePath) {
  try {
    const rawContent = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(rawContent);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error(`Помилка: файл за шляхом "${filePath}" не знайдено.`);
    } else if (error instanceof SyntaxError) {
      console.error(`Помилка: файл "${filePath}" містить некоректний JSON.`);
    } else {
      console.error(`Непередбачена помилка доступу до файлу: ${error.message}`);
    }
    process.exit(1);
  }
}

// ---------------- 1. МЕТАДАНІ ПРОГРАМИ ----------------
program
  .name('rpg-cli')
  .description('Утиліта для аналізу та фільтрації даних RPG-персонажа')
  .version('1.0.0');

// ---------------- 2. ГЛОБАЛЬНА ОПЦІЯ ----------------
program.option(
  '-f, --file <path>',
  'шлях до вхідного JSON-файлу з даними персонажа',
  './data.json'
);

// ====================================================
// ЧАСТИНА 3. ЗАГАЛЬНІ МОЖЛИВОСТІ (ДЛЯ ВСІХ ВАРІАНТІВ)
// ====================================================

/**
 * 1. Можливість "Перелік": стислий список предметів інвентарю з лімітом
 */
program
  .command('list')
  .description('Показати стислий перелік предметів інвентарю')
  .option('-l, --limit <count>', 'обмежити кількість елементів у списку', (val) => {
    const parsed = parseInt(val, 10);
    if (isNaN(parsed) || parsed <= 0) {
      console.error('Помилка: значення ліміту має бути додатним числом.');
      process.exit(1);
    }
    return parsed;
  })
  .action(async (options) => {
    const data = await loadData(program.opts().file);
    let items = data.inventory || [];

    if (options.limit) {
      items = items.slice(0, options.limit);
    }

    console.log(`--- Інвентар персонажа "${data.name}" (${items.length} поз.) ---`);
    for (const item of items) {
      const status = item.isEquipped ? '[екіпіровано]' : '[у сумці]';
      console.log(`• ID: ${item.id} | ${item.name} (${item.type}) ${status}`);
    }
  });

/**
 * 2. Можливість "Один елемент": повні дані одного предмета за ID
 */
program
  .command('item <id>')
  .description('Показати всі дані конкретного предмета за його ідентифікатором')
  .action(async (id) => {
    const data = await loadData(program.opts().file);
    const item = data.inventory?.find((it) => it.id === id);

    if (!item) {
      console.error(`Помилка: предмет з ID "${id}" не знайдено в інвентарі.`);
      process.exit(1);
    }

    console.log(`--- Картка предмета [${item.id}] ---`);
    console.log(JSON.stringify(item, null, 2));
  });

/**
 * 3. Можливість "Окреме поле": читання вкладеного поля через крапку
 */
program
  .command('field <fieldPath>')
  .description('Отримати значення поля (підтримується вкладеність через крапку: stats.intelligence)')
  .action(async (fieldPath) => {
    const data = await loadData(program.opts().file);
    const parts = fieldPath.split('.');
    let current = data;

    for (const part of parts) {
      if (current === undefined || current === null || !(part in current)) {
        console.error(`Помилка: поле "${fieldPath}" відсутнє у документі.`);
        process.exit(1);
      }
      current = current[part];
    }

    // Розрізнення відсутнього поля і явного null
    if (current === null) {
      console.log(`Поле "${fieldPath}": null (значення явно визначене як порожнє)`);
    } else if (typeof current === 'object') {
      console.log(`Поле "${fieldPath}" містить структуру:`);
      console.log(JSON.stringify(current, null, 2));
    } else {
      console.log(`Поле "${fieldPath}": ${current}`);
    }
  });

// ====================================================
// ЧАСТИНА 4. МОЖЛИВОСТІ ВАРІАНТА №8 (RPG-ПЕРСОНАЖ)
// ====================================================

/**
 * Варіант 8. Можливість 1: Рівень і характеристики
 */
program
  .command('stats')
  .description('Показати рівень, досвід та бойові характеристики персонажа')
  .option('-d, --detailed', 'розрахувати сумарний бойовий потенціал персонажа')
  .action(async (options) => {
    const data = await loadData(program.opts().file);
    console.log(`Персонаж: ${data.name} | Клас: ${data.characterClass}`);
    console.log(`Рівень: ${data.level} (Досвід: ${data.experience} XP) | Гільдія: ${data.guild}`);
    console.log('Базові характеристики:');
    for (const [stat, val] of Object.entries(data.stats || {})) {
      console.log(`  - ${stat}: ${val}`);
    }

    if (options.detailed) {
      const stats = data.stats || {};
      const combatRating =
        data.level * 10 +
        (stats.intelligence || 0) * 3 +
        (stats.strength || 0) * 2 +
        (stats.agility || 0) * 2 +
        Math.floor((stats.mana || 0) / 10);
      console.log(`--- Розрахунковий бойовий рейтинг: ${combatRating} pts ---`);
    }
  });

/**
 * Варіант 8. Можливість 2: Інвентар з фільтрацією
 */
program
  .command('inventory')
  .description('Фільтрація інвентарю за категорією або статусом екіпірування')
  .option('-t, --type <type>', 'фільтр за призначенням: weapon, armor, potion, quest')
  .option('-e, --equipped', 'показати лише екіпіровані предмети')
  .action(async (options) => {
    const data = await loadData(program.opts().file);
    let items = data.inventory || [];

    if (options.type) {
      items = items.filter((it) => it.type.toLowerCase() === options.type.toLowerCase());
    }

    if (options.equipped) {
      items = items.filter((it) => it.isEquipped === true);
    }

    if (items.length === 0) {
      console.log('За вказаними критеріями фільтрації предметів не знайдено.');
      return;
    }

    console.log(`Знайдено предметів: ${items.length}`);
    for (const it of items) {
      const eqMark = it.isEquipped ? '⚔️ [Екіпіровано]' : '📦 [У сумці]';
      const dur = it.durability !== null ? `${it.durability}% міцності` : 'витратний/квестовий';
      console.log(`• ${it.name} | тип: ${it.type} | вага: ${it.weight} кг | ${dur} | ${eqMark}`);
    }
  });

/**
 * Варіант 8. Можливість 3: Відомості про навичку
 */
program
  .command('skill <id>')
  .description('Отримати повні відомості про навичку персонажа за її ідентифікатором')
  .action(async (id) => {
    const data = await loadData(program.opts().file);
    const skill = data.skills?.find((s) => s.id === id);

    if (!skill) {
      console.error(`Помилка: навичку з ідентифікатором "${id}" не знайдено.`);
      process.exit(1);
    }

    console.log(`=== Навичка: ${skill.name} (Рівень ${skill.skillLevel}) ===`);
    console.log(`Витрати мани: ${skill.manaCost}`);
    console.log(`Час відновлення (cooldown): ${skill.cooldownSeconds} сек.`);
  });

// Синтаксичний розбір аргументів командного рядка
program.parse(process.argv);