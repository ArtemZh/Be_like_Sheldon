//
//  Заставка для macOS: сайт у веб-в'ю просто у вікні заставки.
//
//  У Sonoma й новіших ScreenSaverEngine тримає в'ю заставки так, що WebKit
//  вважає своє вікно закритим іншими вікнами (occlusion) і присипляє
//  сторінку: rAF глухне, воркери сплять, шари не оновлюються. Лікується
//  вимкненням цієї перевірки — приватний, але стабільний виклик, той самий,
//  що використовує WebViewScreenSaver.
//

#import <Cocoa/Cocoa.h>
#import <ScreenSaver/ScreenSaver.h>
#import <WebKit/WebKit.h>

#import "Site.h"

static NSString *const kModuleName = @"ua.zhavrotskyi.sheldonsaver";
static NSString *const kCompanionId = @"ua.zhavrotskyi.sheldonscreen";

// Журнал у файл: NSLog із пісочниці legacyScreenSaver назовні не долітає.
static void SaverLog(NSString *format, ...) {
  va_list args;
  va_start(args, format);
  NSString *line = [[NSString alloc] initWithFormat:format arguments:args];
  va_end(args);
  NSString *path = [NSTemporaryDirectory() stringByAppendingPathComponent:@"sheldon-saver.log"];
  NSString *stamped = [NSString stringWithFormat:@"%@ %@\n", NSDate.date, line];
  NSFileHandle *handle = [NSFileHandle fileHandleForWritingAtPath:path];
  if (handle == nil) {
    [stamped writeToFile:path atomically:NO encoding:NSUTF8StringEncoding error:NULL];
    return;
  }
  [handle seekToEndOfFile];
  [handle writeData:[stamped dataUsingEncoding:NSUTF8StringEncoding]];
  [handle closeFile];
}

@interface WKWebView (SheldonPrivate)
- (void)_setWindowOcclusionDetectionEnabled:(BOOL)enabled;
@end

#pragma mark - Налаштування

static ScreenSaverDefaults *Settings(void) {
  ScreenSaverDefaults *defaults = [ScreenSaverDefaults defaultsForModuleWithName:kModuleName];
  [defaults registerDefaults:@{@"speed" : @"real", @"scope" : @"all", @"minutes" : @20}];
  return defaults;
}

#pragma mark - Заставка

@interface SheldonSaverView : ScreenSaverView <WKScriptMessageHandler>
@property(nonatomic, strong) WKWebView *web;
@property(nonatomic, strong) id<NSObject> activity;
@property(nonatomic, strong) NSWindow *sheet;
@property(nonatomic, strong) NSPopUpButton *speedField;
@property(nonatomic, strong) NSSlider *minutesField;
@property(nonatomic, strong) NSTextField *minutesLabel;
@property(nonatomic, strong) NSMutableDictionary<NSString *, id> *texts;
@property(nonatomic, strong) NSButton *cancelButton;
@property(nonatomic, strong) NSButton *saveButton;
@property(nonatomic, strong) NSPopUpButton *langField;
@property(nonatomic, strong) NSPopUpButton *regionField;
@property(nonatomic, strong) NSSlider *boardField;
@property(nonatomic, strong) NSTextField *boardLabel;
@property(nonatomic, strong) NSSlider *factField;
@property(nonatomic, strong) NSTextField *factLabel;
@property(nonatomic, strong) NSSlider *refreshField;
@property(nonatomic, strong) NSTextField *refreshLabel;
@property(nonatomic, strong) NSSlider *delayField;
@property(nonatomic, strong) NSTextField *delayLabel;
@property(nonatomic, strong) NSButton *syncField;
@property(nonatomic, strong) NSButton *siteLink;
@property(nonatomic, strong) NSButton *codeLink;
@property(nonatomic, strong) NSButton *coffeeLink;
@property(nonatomic, strong) NSSlider *pauseField;
@property(nonatomic, strong) NSTextField *pauseLabel;
@property(nonatomic, strong) NSSlider *tourField;
@property(nonatomic, strong) NSTextField *tourLabel;
@property(nonatomic, strong) NSButton *clockField;
@property(nonatomic, strong) NSTextField *clockNote;
@property(nonatomic, strong) NSButton *clockButton;
@end

@implementation SheldonSaverView

- (instancetype)initWithFrame:(NSRect)frame isPreview:(BOOL)isPreview {
  if ((self = [super initWithFrame:frame isPreview:isPreview])) {
    self.wantsLayer = YES;
    self.layer.backgroundColor = NSColor.blackColor.CGColor;
    self.animationTimeInterval = 1.0;
  }
  return self;
}

- (void)startAnimation {
  [super startAnimation];
  // Прев'ю в налаштуваннях лишається чорним: 10 МБ фіду заради мініатюри — зайве.
  if (self.isPreview || self.web != nil) return;

  SaverLog(@"старт: bounds=%@ screen=%@", NSStringFromRect(self.bounds),
           NSStringFromSize(self.window.screen.frame.size));

  WKWebView *web = MakeSiteWebView(SiteRoot(self.class), self.bounds);
  web.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
  if ([web respondsToSelector:@selector(_setWindowOcclusionDetectionEnabled:)]) {
    [web _setWindowOcclusionDetectionEnabled:NO];
    SaverLog(@"occlusion detection вимкнено");
  } else {
    SaverLog(@"_setWindowOcclusionDetectionEnabled: немає в цьому WebKit");
  }

  // Сторінка звітує про стан у журнал: у заставці це єдиний спосіб щось побачити.
  [web.configuration.userContentController addScriptMessageHandler:self name:@"saver"];

  [self addSubview:web];
  self.web = web;

  // App Nap присипляє процес заставки за кілька секунд.
  self.activity = [NSProcessInfo.processInfo
      beginActivityWithOptions:NSActivityUserInitiated | NSActivityIdleDisplaySleepDisabled
                        reason:@"screensaver"];

  // Головний екран — той, що перший у NSScreen.screens (з рядком меню). У
  // прискореному режимі він тримає обрану землю, а решта мандрують країною.
  BOOL main = self.window.screen == nil || self.window.screen == NSScreen.screens.firstObject;
  NSString *address = SiteAddress(kModuleName, main);
  SaverLog(@"вантажу %@", address);
  [web loadRequest:[NSURLRequest requestWithURL:[NSURL URLWithString:address]]];
}

- (void)stopAnimation {
  [super stopAnimation];
  SaverLog(@"стоп");
  [self.web.configuration.userContentController removeScriptMessageHandlerForName:@"saver"];
  [self.web stopLoading];
  [self.web removeFromSuperview];
  self.web = nil;
  if (self.activity != nil) {
    [NSProcessInfo.processInfo endActivity:self.activity];
    self.activity = nil;
  }
}

- (void)animateOneFrame {
}

- (void)userContentController:(WKUserContentController *)controller
      didReceiveScriptMessage:(WKScriptMessage *)message {
  SaverLog(@"сторінка: %@", message.body);
}

#pragma mark - Системний годинник заставки

// Великий годинник із датою поверх заставки малює macOS, а не наша сторінка,
// і живе він у чужому домені (`com.apple.screensaver`, до того ж окремо для
// кожного хоста). Запис туди з пісочниці може й не пройти, тому після
// збереження ми перечитуємо значення й показуємо правду.
static NSString *const kClockDomain = @"com.apple.screensaver";
static NSString *const kClockKey = @"showClock";

static BOOL SystemClockShown(void) {
  CFPropertyListRef value = CFPreferencesCopyValue(
      (__bridge CFStringRef)kClockKey, (__bridge CFStringRef)kClockDomain,
      kCFPreferencesCurrentUser, kCFPreferencesCurrentHost);
  BOOL shown = value == nil ? YES : [(__bridge id)value boolValue];
  if (value != nil) {
    CFRelease(value);
  }
  return shown;
}

/// Пробує змінити налаштування системи. Повертає те, що вийшло насправді.
static BOOL SetSystemClockShown(BOOL shown) {
  CFPreferencesSetValue((__bridge CFStringRef)kClockKey, (__bridge CFNumberRef) @(shown),
                        (__bridge CFStringRef)kClockDomain, kCFPreferencesCurrentUser,
                        kCFPreferencesCurrentHost);
  CFPreferencesSynchronize((__bridge CFStringRef)kClockDomain, kCFPreferencesCurrentUser,
                           kCFPreferencesCurrentHost);
  return SystemClockShown();
}

#pragma mark - Тексти вікна

/**
 * Підписи вікна «Параметри» чотирма мовами.
 *
 * Сторінка бере переклади зі `strings.js`, але вікно тут нативне, і дістати
 * їх звідти нема як. Тому словник свій; його треба тримати в парі з
 * `strings.js` руками — рядків небагато, зате вікно говорить тією ж мовою,
 * що й карта, і міняється одразу, без перезапуску.
 *
 * Порядок значень — той самий, що у `SiteLanguages()`: uk, en, de, pl.
 */
static NSDictionary<NSString *, NSArray<NSString *> *> *SheetTexts(void) {
  return @{
    @"show" : @[ @"Що показувати", @"What to show", @"Was anzeigen", @"Co pokazywać" ],
    @"lang" : @[ @"Мова:", @"Language:", @"Sprache:", @"Język:" ],
    @"time" : @[ @"Час:", @"Time:", @"Zeit:", @"Czas:" ],
    @"real" : @[ @"Реальний час", @"Real time", @"Echtzeit", @"Czas rzeczywisty" ],
    @"fast" : @[ @"Прискорено", @"Accelerated", @"Im Zeitraffer", @"Przyspieszony" ],
    @"day" : @[ @"Весь день за:", @"Whole day in:", @"Ganzer Tag in:", @"Cały dzień w:" ],
    @"region" : @[ @"Моя область:", @"My region:", @"Mein Bundesland:", @"Mój region:" ],
    @"all" : @[
      @"— уся Німеччина —", @"— all of Germany —", @"— ganz Deutschland —", @"— całe Niemcy —"
    ],
    @"regionHint" : @[
      @"тільки у прискореному режимі; другий екран мандрує країною",
      @"accelerated mode only; the second screen tours the country",
      @"nur im Zeitraffer; der zweite Bildschirm reist durchs Land",
      @"tylko w trybie przyspieszonym; drugi ekran podróżuje po kraju"
    ],
    @"rhythm" : @[ @"Ритми", @"Rhythm", @"Rhythmus", @"Rytm" ],
    @"board" : @[
      @"Зміна на табло:", @"Board changes every:", @"Anzeige wechselt alle:", @"Zmiana tablicy co:"
    ],
    @"fact" : @[ @"Факт тримається:", @"Fact stays for:", @"Fakt bleibt:", @"Fakt trwa:" ],
    @"pause" : @[
      @"Пауза між показами:", @"Pause between shows:", @"Pause dazwischen:", @"Przerwa między:"
    ],
    @"tour" : @[ @"Мандрівка:", @"Tour step:", @"Reiseschritt:", @"Krok podróży:" ],
    @"refresh" : @[
      @"Оновлення віджета:", @"Widget refresh:", @"Widget-Wechsel:", @"Odświeżanie widżetu:"
    ],
    @"delay" : @[
      @"Запізнення 2-го екрана:", @"Second screen delay:", @"Verzögerung 2. Bildschirm:",
      @"Opóźnienie 2. ekranu:"
    ],
    @"sync" : @[
      @"Однаковий вміст на обох екранах", @"Same content on both screens",
      @"Gleicher Inhalt auf beiden Bildschirmen", @"Ta sama treść na obu ekranach"
    ],
    @"clock" : @[
      @"Сховати системний годинник і дату", @"Hide the system clock and date",
      @"Systemuhr und Datum ausblenden", @"Ukryj systemowy zegar i datę"
    ],
    @"clockFail" : @[
      @"Система не дозволила змінити свій годинник — вимкніть його в налаштуваннях заставки.",
      @"macOS did not allow changing its own clock — turn it off in the screen saver settings.",
      @"macOS ließ die eigene Uhr nicht ändern — schalten Sie sie in den Bildschirmschoner-"
      @"Einstellungen aus.",
      @"macOS nie pozwolił zmienić swojego zegara — wyłącz go w ustawieniach wygaszacza."
    ],
    @"open" : @[ @"Відкрити налаштування", @"Open settings", @"Einstellungen öffnen", @"Otwórz ustawienia" ],
    @"site" : @[ @"Сайт проєкту", @"Project site", @"Projektseite", @"Strona projektu" ],
    @"code" : @[ @"Код на GitHub", @"Code on GitHub", @"Code auf GitHub", @"Kod na GitHubie" ],
    @"coffee" : @[ @"Купити каву", @"Buy me a coffee", @"Kaffee spendieren", @"Postaw kawę" ],
    @"cancel" : @[ @"Скасувати", @"Cancel", @"Abbrechen", @"Anuluj" ],
    @"save" : @[ @"Зберегти", @"Save", @"Sichern", @"Zapisz" ],
    @"min" : @[ @"хв", @"min", @"Min", @"min" ],
    @"sec" : @[ @"с", @"s", @"Sek", @"s" ],
  };
}

#pragma mark - Вікно налаштувань

- (BOOL)hasConfigureSheet {
  return YES;
}

- (NSWindow *)configureSheet {
  if (self.sheet != nil) {
    [self loadSettings];
    return self.sheet;
  }

  NSWindow *sheet = [[NSWindow alloc] initWithContentRect:NSMakeRect(0, 0, 470, 596)
                                                styleMask:NSWindowStyleMaskTitled
                                                  backing:NSBackingStoreBuffered
                                                    defer:NO];
  NSView *content = sheet.contentView;
  self.texts = [NSMutableDictionary dictionary];

  NSTextField *showGroup = [self groupWithTitle:@"" atY:560];
  self.texts[@"show"] = showGroup;
  [content addSubview:showGroup];

  self.langField = [[NSPopUpButton alloc] initWithFrame:NSMakeRect(160, 526, 280, 25)];
  [self.langField addItemsWithTitles:SiteLanguageNames()];
  self.langField.target = self;
  self.langField.action = @selector(languageChanged:);
  [content addSubview:[self labelForKey:@"lang" atY:529]];
  [content addSubview:self.langField];

  self.speedField = [[NSPopUpButton alloc] initWithFrame:NSMakeRect(160, 491, 280, 25)];
  [self.speedField addItemsWithTitles:@[ @"Real time", @"Accelerated" ]];
  [content addSubview:[self labelForKey:@"time" atY:494]];
  [content addSubview:self.speedField];

  self.minutesField = [self sliderFrom:10 to:60 atY:456];
  self.minutesLabel = [self valueLabelAtY:456];
  [content addSubview:[self labelForKey:@"day" atY:459]];
  [content addSubview:self.minutesField];
  [content addSubview:self.minutesLabel];

  self.regionField = [[NSPopUpButton alloc] initWithFrame:NSMakeRect(160, 421, 280, 25)];
  [self.regionField addItemWithTitle:@"— all of Germany —"];
  [self.regionField addItemsWithTitles:SiteCapitals()];
  [content addSubview:[self labelForKey:@"region" atY:424]];
  [content addSubview:self.regionField];

  // Область працює лише у прискореному режимі — кажемо це прямо, щоб не
  // здавалося, що налаштування зламане.
  NSTextField *hint = [[NSTextField alloc] initWithFrame:NSMakeRect(160, 397, 290, 18)];
  self.texts[@"regionHint"] = hint;
  hint.editable = NO;
  hint.bordered = NO;
  hint.drawsBackground = NO;
  hint.font = [NSFont systemFontOfSize:10];
  hint.textColor = NSColor.secondaryLabelColor;
  [content addSubview:hint];

  NSTextField *rhythmGroup = [self groupWithTitle:@"" atY:361];
  self.texts[@"rhythm"] = rhythmGroup;
  [content addSubview:rhythmGroup];

  self.boardField = [self sliderFrom:10 to:120 atY:327];
  self.boardLabel = [self valueLabelAtY:327];
  [content addSubview:[self labelForKey:@"board" atY:330]];
  [content addSubview:self.boardField];
  [content addSubview:self.boardLabel];

  self.factField = [self sliderFrom:5 to:90 atY:292];
  self.factLabel = [self valueLabelAtY:292];
  [content addSubview:[self labelForKey:@"fact" atY:295]];
  [content addSubview:self.factField];
  [content addSubview:self.factLabel];

  self.pauseField = [self sliderFrom:5 to:300 atY:257];
  self.pauseLabel = [self valueLabelAtY:257];
  [content addSubview:[self labelForKey:@"pause" atY:260]];
  [content addSubview:self.pauseField];
  [content addSubview:self.pauseLabel];

  self.tourField = [self sliderFrom:10 to:300 atY:222];
  self.tourLabel = [self valueLabelAtY:222];
  [content addSubview:[self labelForKey:@"tour" atY:225]];
  [content addSubview:self.tourField];
  [content addSubview:self.tourLabel];

  self.refreshField = [self sliderFrom:2 to:120 atY:187];
  self.refreshLabel = [self valueLabelAtY:187];
  [content addSubview:[self labelForKey:@"refresh" atY:190]];
  [content addSubview:self.refreshField];
  [content addSubview:self.refreshLabel];

  self.delayField = [self sliderFrom:0 to:120 atY:152];
  self.delayLabel = [self valueLabelAtY:152];
  [content addSubview:[self labelForKey:@"delay" atY:155]];
  [content addSubview:self.delayField];
  [content addSubview:self.delayLabel];

  self.syncField = [NSButton checkboxWithTitle:@"" target:nil action:nil];
  self.syncField.frame = NSMakeRect(160, 120, 300, 20);
  [content addSubview:self.syncField];

  self.clockField = [NSButton checkboxWithTitle:@"" target:nil action:nil];
  self.clockField.frame = NSMakeRect(160, 84, 300, 20);
  [content addSubview:self.clockField];

  // Місце для правди, якщо система не дасть змінити своє налаштування.
  self.clockNote = [[NSTextField alloc] initWithFrame:NSMakeRect(20, 46, 300, 30)];
  self.clockNote.editable = NO;
  self.clockNote.bordered = NO;
  self.clockNote.drawsBackground = NO;
  self.clockNote.font = [NSFont systemFontOfSize:11];
  self.clockNote.textColor = NSColor.secondaryLabelColor;
  self.clockNote.hidden = YES;
  [content addSubview:self.clockNote];

  self.clockButton = [NSButton buttonWithTitle:@""
                                        target:self
                                        action:@selector(openScreenSaverSettings:)];
  self.clockButton.frame = NSMakeRect(325, 48, 120, 28);
  self.clockButton.hidden = YES;
  [content addSubview:self.clockButton];

  // Куди подивитись, якщо захочеться подробиць: сайт і код.
  self.siteLink = [self linkButtonAtX:20 y:20 action:@selector(openSite:)];
  self.codeLink = [self linkButtonAtX:120 y:20 action:@selector(openCode:)];
  self.coffeeLink = [self linkButtonAtX:220 y:20 action:@selector(openCoffee:)];
  [content addSubview:self.siteLink];
  [content addSubview:self.codeLink];
  [content addSubview:self.coffeeLink];

  self.cancelButton = [NSButton buttonWithTitle:@"" target:self action:@selector(closeSheet:)];
  self.cancelButton.frame = NSMakeRect(250, 14, 100, 32);
  self.saveButton = [NSButton buttonWithTitle:@"" target:self action:@selector(saveSheet:)];
  self.saveButton.frame = NSMakeRect(355, 14, 100, 32);
  self.saveButton.keyEquivalent = @"\r";
  [content addSubview:self.cancelButton];
  [content addSubview:self.saveButton];

  self.sheet = sheet;
  [self loadSettings];
  return sheet;
}

/** Заголовок групи: три групи читаються швидше за десять рядків підряд. */
- (NSTextField *)groupWithTitle:(NSString *)title atY:(CGFloat)y {
  NSTextField *label = [[NSTextField alloc] initWithFrame:NSMakeRect(20, y, 300, 20)];
  label.stringValue = title;
  label.editable = NO;
  label.bordered = NO;
  label.drawsBackground = NO;
  label.font = [NSFont boldSystemFontOfSize:12];
  return label;
}

- (NSSlider *)sliderFrom:(double)min to:(double)max atY:(CGFloat)y {
  NSSlider *slider = [[NSSlider alloc] initWithFrame:NSMakeRect(160, y, 220, 25)];
  slider.minValue = min;
  slider.maxValue = max;
  slider.target = self;
  slider.action = @selector(slidersChanged:);
  return slider;
}

- (NSTextField *)valueLabelAtY:(CGFloat)y {
  NSTextField *label = [[NSTextField alloc] initWithFrame:NSMakeRect(388, y + 3, 70, 20)];
  label.editable = NO;
  label.bordered = NO;
  label.drawsBackground = NO;
  return label;
}

/** Підпис, який знає свій ключ: при зміні мови ми перепишемо його текст. */
/** Посилання виглядає як посилання, а не як кнопка: це не дія, а довідка. */
- (NSButton *)linkButtonAtX:(CGFloat)x y:(CGFloat)y action:(SEL)action {
  NSButton *button = [NSButton buttonWithTitle:@"" target:self action:action];
  button.frame = NSMakeRect(x, y, 100, 24);
  button.bordered = NO;
  button.contentTintColor = NSColor.linkColor;
  button.font = [NSFont systemFontOfSize:11];
  return button;
}

- (void)openSite:(id)sender {
  [NSWorkspace.sharedWorkspace
      openURL:[NSURL URLWithString:@"https://artemzh.github.io/Be_like_Sheldon"]];
}

- (void)openCoffee:(id)sender {
  [NSWorkspace.sharedWorkspace openURL:[NSURL URLWithString:@"https://buycoffee.to/artem_pm"]];
}

- (void)openCode:(id)sender {
  [NSWorkspace.sharedWorkspace
      openURL:[NSURL URLWithString:@"https://github.com/ArtemZh/Be_like_Sheldon"]];
}

- (NSTextField *)labelForKey:(NSString *)key atY:(CGFloat)y {
  NSTextField *label = [self labelWithText:@"" atY:y];
  self.texts[key] = label;
  return label;
}

- (NSTextField *)labelWithText:(NSString *)text atY:(CGFloat)y {
  NSTextField *label = [[NSTextField alloc] initWithFrame:NSMakeRect(10, y, 145, 20)];
  label.stringValue = text;
  label.editable = NO;
  label.bordered = NO;
  label.drawsBackground = NO;
  label.alignment = NSTextAlignmentRight;
  return label;
}

- (void)loadSettings {
  ScreenSaverDefaults *defaults = Settings();
  [self.speedField selectItemAtIndex:[[defaults stringForKey:@"speed"] isEqualToString:@"fast"]];
  NSInteger lang = [SiteLanguages() indexOfObject:[defaults stringForKey:@"lang"] ?: @"uk"];
  [self.langField selectItemAtIndex:lang == NSNotFound ? 0 : lang];
  [self applyLanguage];
  self.minutesField.integerValue = [defaults integerForKey:@"minutes"];
  self.boardField.integerValue = [defaults integerForKey:@"board"];
  self.factField.integerValue = [defaults integerForKey:@"fact"];
  self.pauseField.integerValue = [defaults integerForKey:@"pause"];
  self.refreshField.integerValue = [defaults integerForKey:@"refresh"];
  self.delayField.integerValue = [defaults integerForKey:@"delay"];
  self.syncField.state = [defaults boolForKey:@"sync"] ? NSControlStateValueOn : NSControlStateValueOff;
  self.tourField.integerValue = [defaults integerForKey:@"tour"];
  NSString *region = [defaults stringForKey:@"region"] ?: @"";
  [self.regionField selectItemAtIndex:MAX(0, (NSInteger)[SiteCapitals() indexOfObject:region] + 1)];
  self.clockField.state = SystemClockShown() ? NSControlStateValueOff : NSControlStateValueOn;
  self.clockNote.hidden = YES;
  self.clockButton.hidden = YES;
  [self minutesChanged:nil];
}

/** Вікно говорить тією ж мовою, що й карта, і міняється одразу. */
- (void)applyLanguage {
  NSInteger i = MAX(0, self.langField.indexOfSelectedItem);
  NSDictionary<NSString *, NSArray<NSString *> *> *texts = SheetTexts();
  NSString *(^text)(NSString *) = ^(NSString *key) { return texts[key][i]; };

  for (NSString *key in self.texts) {
    [self.texts[key] setStringValue:text(key)];
  }
  self.clockField.title = text(@"clock");
  self.syncField.title = text(@"sync");
  self.siteLink.title = text(@"site");
  self.codeLink.title = text(@"code");
  self.coffeeLink.title = text(@"coffee");
  self.clockButton.title = text(@"open");
  self.cancelButton.title = text(@"cancel");
  self.saveButton.title = text(@"save");
  self.clockNote.stringValue = text(@"clockFail");

  NSInteger speed = self.speedField.indexOfSelectedItem;
  [self.speedField removeAllItems];
  [self.speedField addItemsWithTitles:@[ text(@"real"), text(@"fast") ]];
  [self.speedField selectItemAtIndex:MAX(0, speed)];

  NSInteger region = self.regionField.indexOfSelectedItem;
  [self.regionField removeAllItems];
  [self.regionField addItemWithTitle:text(@"all")];
  [self.regionField addItemsWithTitles:SiteCapitals()];
  [self.regionField selectItemAtIndex:MAX(0, region)];

  [self slidersChanged:nil];
}

- (void)languageChanged:(id)sender {
  [self applyLanguage];
}

- (void)minutesChanged:(id)sender {
  [self slidersChanged:sender];
}

- (void)slidersChanged:(id)sender {
  NSInteger i = MAX(0, self.langField.indexOfSelectedItem);
  NSString *minutes = SheetTexts()[@"min"][i];
  NSString *seconds = SheetTexts()[@"sec"][i];

  self.minutesLabel.stringValue =
      [NSString stringWithFormat:@"%ld %@", (long)self.minutesField.integerValue, minutes];
  for (NSArray *pair in @[
         @[ self.boardLabel, self.boardField ], @[ self.factLabel, self.factField ],
         @[ self.pauseLabel, self.pauseField ], @[ self.tourLabel, self.tourField ],
         @[ self.refreshLabel, self.refreshField ], @[ self.delayLabel, self.delayField ]
       ]) {
    [pair[0] setStringValue:[NSString stringWithFormat:@"%ld %@",
                                                       (long)[pair[1] integerValue], seconds]];
  }
}

- (void)saveSheet:(id)sender {
  ScreenSaverDefaults *defaults = Settings();
  [defaults setObject:self.speedField.indexOfSelectedItem == 1 ? @"fast" : @"real" forKey:@"speed"];
  [defaults setObject:SiteLanguages()[self.langField.indexOfSelectedItem] forKey:@"lang"];
  [defaults setInteger:self.minutesField.integerValue forKey:@"minutes"];
  [defaults setInteger:self.boardField.integerValue forKey:@"board"];
  [defaults setInteger:self.factField.integerValue forKey:@"fact"];
  [defaults setInteger:self.pauseField.integerValue forKey:@"pause"];
  [defaults setInteger:self.refreshField.integerValue forKey:@"refresh"];
  [defaults setInteger:self.delayField.integerValue forKey:@"delay"];
  [defaults setBool:self.syncField.state == NSControlStateValueOn forKey:@"sync"];
  [defaults setInteger:self.tourField.integerValue forKey:@"tour"];
  NSInteger region = self.regionField.indexOfSelectedItem - 1;
  [defaults setObject:region < 0 ? @"" : SiteCapitals()[region] forKey:@"region"];
  [defaults synchronize];

  // Якщо карта саме зараз показується окремим застосунком, вона тримає старі
  // налаштування: перезапускаємо його, щоб не просити про це людину.
  for (NSRunningApplication *app in
       [NSRunningApplication runningApplicationsWithBundleIdentifier:kCompanionId]) {
    [app terminate];
  }

  BOOL wanted = self.clockField.state == NSControlStateValueOn;
  BOOL shown = SetSystemClockShown(!wanted);
  if (shown == !wanted) {
    [self closeSheet:sender];
    return;
  }

  // Не вийшло: кажемо про це прямо й ведемо туди, де перемикач точно є.
  SaverLog(@"системний годинник змінити не вдалось (лишився %@)", shown ? @"увімкненим" : @"вимкненим");
  self.clockNote.hidden = NO;
  self.clockButton.hidden = NO;
}

- (void)openScreenSaverSettings:(id)sender {
  [NSWorkspace.sharedWorkspace
      openURL:[NSURL URLWithString:@"x-apple.systempreferences:com.apple.ScreenSaver-Settings.extension"]];
}

- (void)closeSheet:(id)sender {
  [NSApp endSheet:self.sheet];
}

@end
