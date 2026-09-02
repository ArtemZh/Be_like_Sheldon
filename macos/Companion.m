//
//  Застосунок-компаньйон: власне те, що видно на екрані.
//
//  Та сама карта, що й у заставці, але як звичайний застосунок: повноекранна
//  карта на кожному екрані, яку закриває будь-який рух миші чи клавіша.
//  Його вмикає агент простою (`install-agent.sh`) або запуск руками.
//

#import <Cocoa/Cocoa.h>

#import "Site.h"

static NSString *const kModuleName = @"ua.zhavrotskyi.sheldonsaver";

@interface Companion : NSObject <NSApplicationDelegate>
@property(nonatomic, strong) NSMutableArray<NSWindow *> *windows;
@end

@implementation Companion

- (void)applicationDidFinishLaunching:(NSNotification *)note {
  self.windows = [NSMutableArray array];
  NSURL *root = SiteRoot(self.class);
  NSString *address = SiteAddress(kModuleName);

  for (NSScreen *screen in NSScreen.screens) {
    NSRect frame = screen.frame;
    NSWindow *window = [[NSWindow alloc] initWithContentRect:frame
                                                   styleMask:NSWindowStyleMaskBorderless
                                                     backing:NSBackingStoreBuffered
                                                       defer:NO];
    // Поверх усього, включно з вікном самої заставки, і на всіх просторах:
    // інакше при перемиканні стола застосунок лишиться позаду. Рівень
    // максимальний, бо заставка ставить своє вікно дуже високо.
    window.level = CGWindowLevelForKey(kCGMaximumWindowLevelKey);
    window.opaque = YES;
    window.backgroundColor = NSColor.blackColor;
    window.ignoresMouseEvents = YES;
    window.collectionBehavior = NSWindowCollectionBehaviorCanJoinAllSpaces |
                                NSWindowCollectionBehaviorStationary |
                                NSWindowCollectionBehaviorFullScreenAuxiliary |
                                NSWindowCollectionBehaviorIgnoresCycle;

    WKWebView *web = MakeSiteWebView(root, NSMakeRect(0, 0, NSWidth(frame), NSHeight(frame)));
    web.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    window.contentView = web;
    [window orderFrontRegardless];
    [self.windows addObject:window];

    NSURL *url = [NSURL URLWithString:address];
    if (url != nil) {
      [web loadRequest:[NSURLRequest requestWithURL:url]];
    }
  }

  // Заставка піднімає своє вікно вже після нашого старту, тож раз на секунду
  // нагадуємо про себе.
  [NSTimer scheduledTimerWithTimeInterval:1.0
                                  repeats:YES
                                    block:^(NSTimer *timer) {
    for (NSWindow *window in self.windows) {
      [window orderFrontRegardless];
    }
  }];

  // Виходимо від руху миші чи клавіші — як справжня заставка. Перші дві
  // секунди не рахуються: під час запуску система сама шле кілька подій.
  NSDate *ready = [NSDate dateWithTimeIntervalSinceNow:2];
  [NSEvent addGlobalMonitorForEventsMatchingMask:NSEventMaskMouseMoved | NSEventMaskKeyDown |
                                                 NSEventMaskLeftMouseDown |
                                                 NSEventMaskRightMouseDown | NSEventMaskScrollWheel
                                         handler:^(NSEvent *event) {
    if (ready.timeIntervalSinceNow < 0) {
      [NSApp terminate:nil];
    }
  }];
}

@end

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    NSApplication *app = NSApplication.sharedApplication;
    Companion *companion = [[Companion alloc] init];
    app.delegate = companion;
    [app setActivationPolicy:NSApplicationActivationPolicyAccessory];
    [app run];
  }
  return 0;
}
