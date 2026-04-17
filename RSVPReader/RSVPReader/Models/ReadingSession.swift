import Foundation

struct ReadingSession: Codable, Identifiable {
    var id: String { title }
    var title: String
    var bookmarkData: Data?
    var wordIndex: Int
    var wpm: Double
    var totalWords: Int
    var lastOpened: Date

    var progress: Double {
        guard totalWords > 0 else { return 0 }
        return Double(wordIndex) / Double(max(totalWords - 1, 1))
    }

    var progressText: String {
        "\(wordIndex + 1) / \(totalWords) words · \(Int(progress * 100))%"
    }
}
