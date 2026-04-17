import SwiftUI

@main
struct RSVPReaderApp: App {
    @StateObject private var sessionStore = SessionStore()

    var body: some Scene {
        WindowGroup {
            LibraryView()
                .environmentObject(sessionStore)
        }
    }
}
