// Уведомления приложения
export const NOTIFICATIONS = {
  // 🔐 Авторизация
  LOGIN_SUCCESS: '✅ Логин успех',
  LOGIN_ERROR: (detail) => `❌ Логин ошибка${detail ? ': ' + detail : ''}`,
  REGISTER_SUCCESS: '✅ Регистрация аккаунта успех',
  REGISTER_ERROR: (detail) => `❌ Регистрация ошибка${detail ? ': ' + detail : ''}',
  PASSWORD_RESET_SENT: '✅ Восстановление пароля отправлено',
  PASSWORD_RESET_ERROR: (detail) => `❌ Ошибка${detail ? ': ' + detail : ''}`,
  PASSWORD_CHANGE_SUCCESS: '✅ Смена пароля успех',
  PASSWORD_CHANGE_ERROR: (detail) => `❌ Смена пароля ошибка${detail ? ': ' + detail : ''}`,
  LOGOUT_SUCCESS: '✅ Логаут успех',

  // 📍 Работа с треками
  TRACK_UPLOADED: (name) => `✅ Трек загружен${name ? ': ' + name : ''}`,
  TRACK_UPLOADED_SUCCESS: (name) => `✅ Трек загружен успешно${name ? ': ' + name : ''}`,
  TRACK_UPLOAD_ERROR: (name) => `❌ Загрузка трека ошибка${name ? ': ' + name : ''}`,
  TRACK_DOWNLOADED: '✅ Трек скачан/экспортирован',
  TRACK_DOWNLOAD_ERROR: '❌ Скачивание ошибка',
  TRACK_DELETED: '✅ Трек удален',
  TRACK_DELETE_ERROR: '❌ Удаление трека ошибка',
  TRACK_RENAMED: '✅ Трек переименован',
  TRACK_RENAME_ERROR: '❌ Переименование ошибка',
  TRACK_SAVED: '✅ Трек сохранен',
  TRACK_SAVE_ERROR: '❌ Ошибка сохранения трека',

  // 🌐 Система
  INTERNET_LOST: '⚠️ Интернет соединение потеряно',
  INTERNET_RESTORED: '✅ Интернет восстановлен',
  RATE_LIMIT_EXCEEDED: '⚠️ Превышен лимит запросов',
};
