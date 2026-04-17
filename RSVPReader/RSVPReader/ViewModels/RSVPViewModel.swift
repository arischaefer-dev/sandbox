import Foundation
import PDFKit

class RSVPViewModel: ObservableObject {
    @Published private(set) var words: [String] = []
    @Published var currentIndex: Int = 0
    @Published var wpm: Double = 250
    @Published var isPlaying: Bool = false
    @Published var isLoading: Bool = false
    @Published var isFinished: Bool = false
    @Published var errorMessage: String?

    private(set) var title: String = ""
    private var timer: Timer?
    private let store: SessionStore

    init(store: SessionStore) {
        self.store = store
    }

    deinit { timer?.invalidate() }

    var currentWord: String {
        guard !words.isEmpty, words.indices.contains(currentIndex) else { return "" }
        return words[currentIndex]
    }

    var progress: Double {
        guard words.count > 1 else { return 0 }
        return Double(currentIndex) / Double(words.count - 1)
    }

    var progressText: String { "\(currentIndex + 1) of \(words.count)" }

    private var interval: TimeInterval { 60.0 / max(wpm, 1) }

    func load(url: URL, bookmarkData: Data? = nil) {
        isLoading = true
        isFinished = false
        errorMessage = nil
        title = url.deletingPathExtension().lastPathComponent

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self else { return }
            guard let doc = PDFDocument(url: url) else {
                DispatchQueue.main.async {
                    self.errorMessage = "Could not open PDF — make sure it contains extractable text."
                    self.isLoading = false
                }
                return
            }

            var text = ""
            for i in 0..<doc.pageCount {
                if let page = doc.page(at: i), let s = page.string { text += s + " " }
            }

            let extracted = text
                .components(separatedBy: .whitespacesAndNewlines)
                .filter { !$0.isEmpty }

            DispatchQueue.main.async {
                self.words = extracted
                self.isLoading = false

                if let saved = self.store.session(for: self.title) {
                    self.currentIndex = min(saved.wordIndex, max(0, extracted.count - 1))
                    self.wpm = saved.wpm
                } else {
                    self.currentIndex = 0
                }

                self.saveSession(bookmarkData: bookmarkData)
            }
        }
    }

    func togglePlayPause() { isPlaying ? pause() : play() }

    func play() {
        guard !words.isEmpty, currentIndex < words.count - 1 else { return }
        isPlaying = true
        isFinished = false
        scheduleTimer()
    }

    func pause() {
        isPlaying = false
        timer?.invalidate()
        timer = nil
        saveSession()
    }

    func step(by delta: Int) {
        currentIndex = max(0, min(currentIndex + delta, words.count - 1))
        saveSession()
    }

    func seekToStart() {
        currentIndex = 0
        isFinished = false
        saveSession()
    }

    func setWPM(_ value: Double) {
        wpm = max(60, min(800, value))
        if isPlaying { scheduleTimer() }
        saveSession()
    }

    private func scheduleTimer() {
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: interval, repeats: true) { [weak self] _ in
            self?.advance()
        }
    }

    private func advance() {
        guard currentIndex < words.count - 1 else {
            pause()
            isFinished = true
            return
        }
        currentIndex += 1
        if currentIndex % 100 == 0 { saveSession() }
    }

    private func saveSession(bookmarkData: Data? = nil) {
        guard !title.isEmpty, !words.isEmpty else { return }
        var session = store.session(for: title) ?? ReadingSession(
            title: title,
            bookmarkData: bookmarkData,
            wordIndex: currentIndex,
            wpm: wpm,
            totalWords: words.count,
            lastOpened: Date()
        )
        session.wordIndex = currentIndex
        session.wpm = wpm
        session.totalWords = words.count
        session.lastOpened = Date()
        if let bm = bookmarkData { session.bookmarkData = bm }
        store.upsert(session)
    }
}
