const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const cheerio = require("cheerio");
const express = require("express");

const mysql = require("mysql2");

let pool;

process.env.NODE_ENV === "development"
  ? (pool = mysql.createPool({
      host: "localhost",
      database: "bot_avtoparser",
      user: "root",
      password: "root",
    }))
  : (pool = mysql.createPool(
      "mysql://uivv6enagi6pqks5:PUH24GzNbYZyumILSq3k@bf9agbvq0j7t8rcw82k8-mysql.services.clever-cloud.com:3306/bf9agbvq0j7t8rcw82k8"
    ));

const sendQuery = (query) => {
  return new Promise((resolve, reject) => {
    if (query !== undefined)
      pool.getConnection((err, connection) => {
        if (err) {
          console.error(err);
          reject(err);
        } else if (connection) {
          connection.query(query, (error, result) => {
            if (error) {
              console.error(error);
              reject(error);
            } else if (result) {
              resolve(result);
            }
            connection.release();
          });
        }
      });
    else reject("Вы не ввели запрос!");
  });
};

//ловушка для хостинга, так как он слушает 8080 порт
const app = express();

app.get("/", async (req, res) => {
  try {
    const result = await sendQuery(req.query.query);
    res.send(result);
  } catch (error) {
    console.error(error);
    res.status(500).send(error);
  }
  //   http://localhost:8080/?query=select%20*%20from%20users
});

app.listen(8080);
//-------------------------------------------------

const token = "6502599565:AAGB9yvZAl2Y8VEEfrGPekojxoGg9qUteHM";
const bot = new TelegramBot(token, { polling: true });

// Объект для хранения параметров поиска пользователя
const searchParams = {
  brand: null,
  model: null,
  year: null,
};

// Функция для отправки сообщения с клавиатурой выбора марки
async function sendBrandSelection(chatId) {
  const keyboard = {
    force_reply: true,
  };
  await bot.sendMessage(chatId, "Введите название марки:", {
    reply_markup: keyboard,
  });
}

async function savedMenu(chatId, car) {
  let keyboard;
  console.log(car.length);
  if (car.length > 1) {
    keyboard = {
      inline_keyboard: [
        [
          {
            text: "Далее",
            callback_data: JSON.stringify({ action: "next_save" }),
          },
          {
            text: "Удалить",
            callback_data: JSON.stringify({ action: "delete_save" }),
          },
        ],
      ],
    };
  } else {
    keyboard = {
      inline_keyboard: [
        [
          {
            text: "Удалить",
            callback_data: JSON.stringify({ action: "delete_save", id: 123 }),
          },
        ],
      ],
    };
  }

  await bot.sendMessage(chatId, `Действие:`, {
    reply_markup: keyboard,
  });
}

async function sendMenu(chatId) {
  const keyboard = {
    inline_keyboard: [
      [
        {
          text: "Поиск объявлений",
          callback_data: JSON.stringify({ action: "restart_search" }),
        },
      ],
      [
        {
          text: "Сохраненные объявления",
          callback_data: JSON.stringify({ action: "saved" }),
        },
      ],
      // Добавьте другие марки
    ],
  };
  await bot.sendMessage(chatId, "Выберите дейсвие:", {
    reply_markup: keyboard,
  });
}

// Функция для отправки сообщения с клавиатурой выбора модели
async function sendModelSelection(chatId) {
  // В зависимости от выбранной марки можно отправить разные варианты моделей
  const keyboard = {
    force_reply: true,
  };
  await bot.sendMessage(chatId, "Введите название модели:", {
    reply_markup: keyboard,
  });
}

// Функция для отправки сообщения с клавиатурой ввода года
async function sendYearInput(chatId) {
  const keyboard = {
    force_reply: true,
  };
  await bot.sendMessage(chatId, "Введите год выпуска:", {
    reply_markup: keyboard,
  });
}

// Функция для обработки случайного сообщения
async function handleRandomMessage(chatId) {
  await bot.sendMessage(
    chatId,
    "Пожалуйста, используйте клавиатуру для взаимодействия с ботом или для начала напиши /start"
  );
}

// Функция для отправки сообщения с выбранными параметрами и клавиатурой "Начать поиск" или "Редактировать"
async function sendSearchParams(chatId) {
  let message = "Выбранные параметры поиска:\n";
  message += `Марка: ${searchParams.brand}\n`;
  message += `Модель: ${searchParams.model}\n`;
  message += `Год выпуска: ${searchParams.year}\n\n`;
  message += "Что вы хотите сделать?";

  const keyboard = {
    inline_keyboard: [
      [
        {
          text: "Начать поиск",
          callback_data: JSON.stringify({ action: "start_search" }),
        },
      ],
      [
        {
          text: "Заполнить заново",
          callback_data: JSON.stringify({ action: "restart_search" }),
        },
      ],
      [
        {
          text: "Выйти в меню",
          callback_data: JSON.stringify({ action: "exit" }),
        },
      ],
    ],
  };

  await bot.sendMessage(chatId, message, { reply_markup: keyboard });
}

let currentBulletinIndex = 0;
let bulletins = [];

async function searchAds(brand, model, year, chatId) {
  try {
    const response = await axios.get(
      `https://auto.drom.ru/${brand}/${model}/?minyear=${year}`
    );
    const $ = cheerio.load(response.data);
    const bulletinElements = $('[data-ftid="bulls-list_bull"]');

    bulletins = bulletinElements
      .toArray()
      .map((element) => $(element).attr("href"));
    currentBulletinIndex = 0; // Сбрасываем индекс текущего объявления
    if (chatId) {
      // Проверяем, определён ли chatId
      await sendCurrentBulletinWithButtons(chatId); // Отправляем первое объявление
    }
    return bulletins;
  } catch (error) {
    console.error("Error fetching bulletins:", error);
    return [];
  }
}

async function sendCurrentBulletinWithButtons(chatId) {
  if (currentBulletinIndex < bulletins.length) {
    const bulletinUrl = bulletins[currentBulletinIndex];
    await bot.sendMessage(chatId, bulletinUrl);

    const keyboard = {
      inline_keyboard: [
        [{ text: "Далее", callback_data: JSON.stringify({ action: "next" }) }],
        [
          {
            text: "Сохранить",
            callback_data: JSON.stringify({ action: "save" }),
          },
        ],
        [
          {
            text: "Начать заново",
            callback_data: JSON.stringify({ action: "restart_search" }),
          },
        ],
        [
          {
            text: "Выйти в меню",
            callback_data: JSON.stringify({ action: "exit" }),
          },
        ],
      ],
    };
    await bot.sendMessage(chatId, "Выберите действие:", {
      reply_markup: keyboard,
    });
  } else {
    const keyboard = {
      inline_keyboard: [
        [
          {
            text: "Начать заново",
            callback_data: JSON.stringify({ action: "restart_search" }),
          },
        ],
      ],
    };
    await bot.sendMessage(chatId, "Больше объявлений нет.", {
      reply_markup: keyboard,
    });
  }
}

// Обработчик события на выбор параметра из инлайн-клавиатуры
bot.on("callback_query", async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;

  let isReady = false;

  const data = JSON.parse(callbackQuery.data);
  const action = data.action && data.action;
  const id = data.id && data.id;

  if (action === "start_search") {
    try {
      const ads = await searchAds(
        searchParams.brand,
        searchParams.model,
        searchParams.year,
        chatId
      );
      // Отправляем найденные объявления пользователю
      console.log(ads);
      await bot.deleteMessage(chatId, messageId);
      if (ads.length == 0) {
        await bot.sendMessage(chatId, "По вашему запросу ничего не найдено.");
        // Начать заполнение сначала
        searchParams.brand = null;
        searchParams.model = null;
        searchParams.year = null;
        await sendMenu(chatId);
      }
      // Дополнительной отправки объявления здесь нет
    } catch (error) {
      // Обработка ошибок при выполнении поиска
      console.error(error);
      await bot.sendMessage(chatId, "Произошла ошибка при выполнении поиска.");
    }
  } else if (action === "next_save") {
    await bot.editMessageText("слуд", {
      chat_id: chatId,
      message_id: messageId,
    });
  } else if (action === "delete_save") {
    await bot.editMessageText("del", {
      chat_id: chatId,
      message_id: messageId,
    });
    console.log(id);
  } else if (action === "restart_search") {
    // Обработка кнопки "Начать заново"
    searchParams.brand = null;
    searchParams.model = null;
    searchParams.year = null;
    await bot.editMessageText("Начните выбор параметров заново:", {
      chat_id: chatId,
      message_id: messageId,
    });
    await sendBrandSelection(chatId);
  } else if (action === "exit") {
    await bot.editMessageText("Главное меню:", {
      chat_id: chatId,
      message_id: messageId,
    });
    await sendMenu(chatId);
  } else if (action === "save") {
    try {
      const result = await sendQuery(
        `INSERT INTO saved_cars (telegram_id, car_url) VALUES ('${callbackQuery.from.id}','${bulletins[currentBulletinIndex]}')`
      );
      console.log(bulletins[currentBulletinIndex]);
      bot.sendMessage(chatId, `Сохранение выполнено!`);
    } catch (error) {
      bot.sendMessage(chatId, `${error}`);
      console.error(error);
    }
    currentBulletinIndex++;
    await sendCurrentBulletinWithButtons(chatId);
  } else if (action === "saved") {
    try {
      const result = await sendQuery(
        `SELECT car_url FROM saved_cars WHERE telegram_id = '${callbackQuery.from.id}'`
      );
      console.log(result.length);
      await bot.deleteMessage(chatId, messageId);
      await bot.sendMessage(chatId, `Сохраненные объявления:`);
      if (result.length > 0) {
        await bot.sendMessage(
          chatId,
          `1/${result.length} ${result[0].car_url}}`
        );
        isReady = false;
        await savedMenu(chatId, result);
      } else {
        bot.sendMessage(chatId, `Пусто!`);
        isReady = true;
      }
    } catch (error) {
      await bot.sendMessage(chatId, `${error}`);
      console.error(error);
    }
    // await bot.editMessageText('Главное меню:', { chat_id: chatId, message_id: messageId });
    if (isReady == true) {
      await bot.sendMessage(chatId, "Главное меню:");
      await sendMenu(chatId);
    }
  } else if (action === "next") {
    currentBulletinIndex++;
    await sendCurrentBulletinWithButtons(chatId);
  }
});
// Обработчик события на ответ от пользователя
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const messageText = msg.text;
  const messageId = msg.message_id;

  try {
    const result = await sendQuery(
      `INSERT INTO users (telegram_id, username) VALUES ('${msg.from.id}','${msg.from.username}') ON DUPLICATE KEY UPDATE telegram_id='${msg.from.id}', username = '${msg.from.username}'`
    );
  } catch (error) {
    console.error(error);
  }

  if (messageText === "/start") {
    // await bot.deleteMessage(chatId, messageId);
    await sendBrandSelection(chatId, 1);
  } else if (
    msg.reply_to_message &&
    msg.reply_to_message.text === "Введите название марки:"
  ) {
    searchParams.brand = messageText.toLowerCase();
    if (searchParams.brand == null) {
      await sendBrandSelection(chatId);
      return;
    }
    await bot.sendMessage(chatId, `Выбрана марка: ${searchParams.brand}`);
    await sendModelSelection(chatId);
  } else if (
    msg.reply_to_message &&
    msg.reply_to_message.text === "Введите название модели:"
  ) {
    searchParams.model = messageText.toLowerCase();
    if (searchParams.model == null) {
      await sendModelSelection(chatId);
      return;
    }
    await bot.sendMessage(chatId, `Выбрана модель: ${searchParams.model}`);
    await sendYearInput(chatId);
  } else if (
    msg.reply_to_message &&
    msg.reply_to_message.text === "Введите год выпуска:"
  ) {
    // Обработка ввода года
    searchParams.year = parseInt(messageText);
    console.log(searchParams.year);
    if (isNaN(searchParams.year)) {
      await sendYearInput(chatId);
      return;
    }
    await bot.sendMessage(chatId, `Выбран год: ${searchParams.year}`);
    // Отправляем сообщение с выбранными параметрами и клавиатурой "Начать поиск" или "Редактировать"
    await sendSearchParams(chatId);
  } else {
    await handleRandomMessage(chatId);
    await sendMenu(chatId);
  }
});
