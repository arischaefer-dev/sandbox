import Foundation
import Combine

class SessionStore: ObservableObject {
    @Published private(set) var sessions: [ReadingSession] = []
    private let defaultsKey = "com.rsvpreader.sessions.v1"

    init() { load() }

    func upsert(_ session: ReadingSession) {
        if let idx = sessions.firstIndex(where: { $0.title == session.title }) {
            sessions[idx] = session
        } else {
            sessions.append(session)
        }
        sessions.sort { $0.lastOpened > $1.lastOpened }
        persist()
    }

    func session(for title: String) -> ReadingSession? {
        sessions.first { $0.title == title }
    }

    func resolvedURL(for session: ReadingSession) -> URL? {
        guard let data = session.bookmarkData else { return nil }
        var stale = false
        guard let url = try? URL(
            resolvingBookmarkData: data,
            options: [],
            relativeTo: nil,
            bookmarkDataIsStale: &stale
        ) else { return nil }
        return stale ? nil : url
    }

    func delete(at offsets: IndexSet) {
        sessions.remove(atOffsets: offsets)
        persist()
    }

    private func persist() {
        guard let data = try? JSONEncoder().encode(sessions) else { return }
        UserDefaults.standard.set(data, forKey: defaultsKey)
    }

    private func load() {
        guard
            let data = UserDefaults.standard.data(forKey: defaultsKey),
            let decoded = try? JSONDecoder().decode([ReadingSession].self, from: data)
        else { return }
        sessions = decoded
    }
}
