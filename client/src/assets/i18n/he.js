const he = {
  // App general
  appName: "PostIt",
  logout: "התנתק",

  // Login page
  login: {
    title: "PostIt",
    subtitle: "חיפוש וצילום קבוצות פייסבוק",
    loginTab: "התחברות",
    registerTab: "הרשמה",
    emailPlaceholder: "אימייל",
    passwordPlaceholder: "סיסמה (לפחות 6 תווים)",
    namePlaceholder: "שם (אופציונלי)",
    loginBtn: "🔑 התחבר",
    registerBtn: "📝 הירשם",
    facebookCredentialsLabel: "🔗 פרטי אפליקציית פייסבוק",
    facebookAppIdPlaceholder: "Facebook App ID",
    facebookAppSecretPlaceholder: "Facebook App Secret",
    description: "לחץ על הכפתור. אחרי זה, בטרמינל, הרץ את הפקודה שתתקבל.",
    checkSession: "בדוק סשן פייסבוק",
    checkingSession: "בודק סשן...",
    instructionTitle: "צעדים:",
    instructionStep1: "בטרמינל בתיקיית server, הרץ:",
    instructionStep2: "דפדפן יתפתח - התחבר לפייסבוק",
    instructionStep3: 'אחרי ההתחברות, חוזר לכאן ולחץ "בדוק סשן"',
    errorNoSession: "לא הצלחת להתחבר בחלון שנפתח. נסה שוב.",
    errorGeneric: "שגיאה:",
  },

  // Dashboard page
  dashboard: {
    title: "לוח הבקרה",
    myGroups: "הקבוצות שלי בפייסבוק",
    description:
      'לחץ לטעון את רשימת הקבוצות. לחץ "פרטים" כדי לצלם או לפרסם פוסט.',
    loadGroups: "טען את הקבוצות שלי",
    refreshGroups: "רענן קבוצות",
    loadingGroups: "טוען קבוצות...",
    groupsFound: (count) => `נמצאו ${count} קבוצות:`,
    noGroupsFound: "לא נמצאו קבוצות",
    searchPlaceholder: "חפש קבוצה...",
  },

  // Generic list
  list: {
    details: "פרטים",
    noItems: "אין פריטים",
    openLink: "פתח",
  },

  // Group details page
  groupDetails: {
    backToList: "חזרה לרשימה",
    openInFacebook: "פתח בפייסבוק",
    captureScreenshot: "צלם מסך",
    capturing: "מצלם...",
    publishPost: "פרסם פוסט",
    groupNotFound: "הקבוצה לא נמצאה. חזור לדשבורד.",
    back: "חזרה",
    screenshotTitle: "צילום מסך",
    captureFailed: "לא הצליח לצלם. נסה שוב.",
  },

  // Publish form
  publish: {
    title: "יצירת פוסט",
    textPlaceholder: "כתוב משהו...",
    addImage: "תמונה/סרטון",
    addToPost: "הוסף לפוסט שלך",
    tagPeople: "תייג אנשים",
    addEmoji: "רגש/פעילות",
    addLocation: "מיקום",
    locationPlaceholder: "הוסף מיקום...",
    postAnonymously: "פרסום אנונימי",
    submit: "פרסם",
    publishing: "מפרסם...",
    success: "הפוסט פורסם בהצלחה!",
    failed: "הפרסום נכשל. נסה שוב.",
    textRequired: "יש לכתוב טקסט לפוסט",
    postLink: "קישור לפוסט",
  },

  // Errors
  errors: {
    generic: "שגיאה:",
    sessionRequired: "יש להתחבר מחדש לפייסבוק",
    fbSessionRequired:
      "נדרש סשן פייסבוק. הרץ בטרמינל: npm run bootstrap-session",
  },
};

export default he;
