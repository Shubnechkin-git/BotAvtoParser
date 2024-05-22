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
    inline_keyboard: [
      [{ text: "Toyota", callback_data: "brand_Toyota" }],
      [{ text: "Kia", callback_data: "brand_Kia" }],
      [{ text: "Выйти в меню", callback_data: "exit" }],
      // Добавьте другие марки
    ],
  };
  await bot.sendMessage(chatId, "Выберите марку:", { reply_markup: keyboard });
}

async function sendMenu(chatId) {
  const keyboard = {
    inline_keyboard: [
      [{ text: "Поиск объявлений", callback_data: "restart_search" }],
      [{ text: "Сохраненные объявления", callback_data: "saved" }],
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
    inline_keyboard: [
      [{ text: "Camry", callback_data: "model_Camry" }],
      [{ text: "Rio", callback_data: "model_Rio" }],
      // Добавьте другие модели
      [{ text: "Назад", callback_data: "back" }],
      [{ text: "Выйти в меню", callback_data: "exit" }],
    ],
  };
  await bot.sendMessage(chatId, "Выберите модель:", { reply_markup: keyboard });
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
      [{ text: "Начать поиск", callback_data: "start_search" }],
      [{ text: "Заполнить заново", callback_data: "restart_search" }],
      [{ text: "Выйти в меню", callback_data: "exit" }],
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
        [{ text: "Далее", callback_data: "next" }],
        [{ text: "Сохранить", callback_data: "save" }],
        [{ text: "Начать заново", callback_data: "restart_search" }],
        [{ text: "Выйти в меню", callback_data: "exit" }],
      ],
    };
    await bot.sendMessage(chatId, "Выберите действие:", {
      reply_markup: keyboard,
    });
  } else {
    const keyboard = {
      inline_keyboard: [
        [{ text: "Начать заново", callback_data: "restart_search" }],
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
  const parameter = callbackQuery.data;

  if (parameter.startsWith("brand_")) {
    // Обработка выбора марки
    const brand = parameter.replace("brand_", "");
    searchParams.brand = brand.toLowerCase();
    await bot.editMessageText(`Выбрана марка: ${brand}`, {
      chat_id: chatId,
      message_id: messageId,
    });
    await sendModelSelection(chatId); // Отправляем клавиатуру для выбора модели
  } else if (parameter.startsWith("model_")) {
    // Обработка выбора модели
    const model = parameter.replace("model_", "");
    searchParams.model = model.toLowerCase();
    await bot.editMessageText(`Выбрана модель: ${model}`, {
      chat_id: chatId,
      message_id: messageId,
    });
    await sendYearInput(chatId); // Отправляем клавиатуру для ввода года
  } else if (parameter === "back") {
    // Обработка кнопки "Назад"
    // Очистка параметров и отправка клавиатуры для выбора марки
    searchParams.brand = null;
    searchParams.model = null;
    await bot.editMessageText("Выберите марку:", {
      chat_id: chatId,
      message_id: messageId,
    });
    await sendBrandSelection(chatId);
  } else if (parameter === "next") {
    currentBulletinIndex++;
    await sendCurrentBulletinWithButtons(chatId);
  } else if (parameter === "save") {
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
  } else if (parameter === "start_search") {
    try {
      const ads = await searchAds(
        searchParams.brand,
        searchParams.model,
        searchParams.year,
        chatId
      );
      // Отправляем найденные объявления пользователю
      console.log(ads);
      if (ads.length == 0) {
        await bot.sendMessage(chatId, "По вашему запросу ничего не найдено.");
        // Начать заполнение сначала
        searchParams.brand = null;
        searchParams.model = null;
        searchParams.year = null;
        await sendBrandSelection(chatId);
      }
      // Дополнительной отправки объявления здесь нет
    } catch (error) {
      // Обработка ошибок при выполнении поиска
      console.error(error);
      await bot.sendMessage(chatId, "Произошла ошибка при выполнении поиска.");
    }
  } else if (parameter === "restart_search") {
    // Обработка кнопки "Начать заново"
    searchParams.brand = null;
    searchParams.model = null;
    searchParams.year = null;
    await bot.editMessageText("Начните выбор параметров заново:", {
      chat_id: chatId,
      message_id: messageId,
    });
    await sendBrandSelection(chatId);
  } else if (parameter === "exit") {
    await bot.editMessageText("Главное меню:", {
      chat_id: chatId,
      message_id: messageId,
    });
    await sendMenu(chatId);
  } else if (parameter === "saved") {
    try {
      const result = await sendQuery(
        `SELECT car_url FROM saved_cars WHERE telegram_id = '${callbackQuery.from.id}'`
      );
      console.log(result.length);
      if (result.length > 0) {
        await bot.sendMessage(chatId, `Сохраненные объявления`);
        for (let [index, element] of result.entries()) {
          await bot.sendMessage(
            chatId,
            `${index + 1}/${result.length} \n ${element.car_url}`
          );
        }
      } else {
        bot.sendMessage(chatId, `Пусто!`);
      }
    } catch (error) {
      await bot.sendMessage(chatId, `${error}`);
      console.error(error);
    }
    // await bot.editMessageText('Главное меню:', { chat_id: chatId, message_id: messageId });
    await bot.sendMessage(chatId, "Главное меню:");
    await sendMenu(chatId);
  }
});
// Обработчик события на ответ от пользователя

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const messageText = msg.text;

  try {
    const result = await sendQuery(
      `INSERT INTO users (telegram_id, username) VALUES ('${msg.from.id}','${msg.from.username}') ON DUPLICATE KEY UPDATE telegram_id='${msg.from.id}', username = '${msg.from.username}'`
    );
  } catch (error) {
    console.error(error);
  }

  if (messageText === "/start") {
    await sendBrandSelection(chatId);
  } else if (
    msg.reply_to_message &&
    msg.reply_to_message.text === "Введите год выпуска:"
  ) {
    // Обработка ввода года
    searchParams.year = parseInt(messageText);
    await bot.sendMessage(chatId, `Выбран год: ${searchParams.year}`);
    // Отправляем сообщение с выбранными параметрами и клавиатурой "Начать поиск" или "Редактировать"
    await sendSearchParams(chatId);
  } else {
    await handleRandomMessage(chatId);
    await sendMenu(chatId);
  }
});
