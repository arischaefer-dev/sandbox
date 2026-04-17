import SwiftUI

struct LibraryView: View {
    @EnvironmentObject var store: SessionStore
    @State private var showingPicker = false
    @State private var activeViewModel: RSVPViewModel?
    @State private var isReading = false

    var body: some View {
        NavigationView {
            Group {
                if store.sessions.isEmpty {
                    emptyState
                } else {
                    sessionList
                }
            }
            .navigationTitle("RSVP Reader")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button { showingPicker = true } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showingPicker) {
                DocumentPickerView { url, bookmarkData in
                    let vm = RSVPViewModel(store: store)
                    let accessing = url.startAccessingSecurityScopedResource()
                    vm.load(url: url, bookmarkData: bookmarkData)
                    if accessing { url.stopAccessingSecurityScopedResource() }
                    activeViewModel = vm
                    isReading = true
                }
            }
            .fullScreenCover(isPresented: $isReading, onDismiss: {
                activeViewModel?.pause()
            }) {
                if let vm = activeViewModel {
                    ReaderScreen(viewModel: vm)
                }
            }
        }
        .navigationViewStyle(.stack)
    }

    private var emptyState: some View {
        VStack(spacing: 24) {
            Image(systemName: "doc.text.magnifyingglass")
                .font(.system(size: 72))
                .foregroundColor(.secondary)
            VStack(spacing: 8) {
                Text("No PDFs loaded")
                    .font(.title2.bold())
                Text("Tap + to pick a PDF.\nYour reading position is saved automatically.")
                    .multilineTextAlignment(.center)
                    .foregroundColor(.secondary)
                    .padding(.horizontal, 40)
            }
            Button("Open PDF") { showingPicker = true }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
        }
    }

    private var sessionList: some View {
        List {
            ForEach(store.sessions) { session in
                SessionRow(session: session) {
                    openSession(session)
                }
            }
            .onDelete { store.delete(at: $0) }
        }
        .listStyle(.insetGrouped)
    }

    private func openSession(_ session: ReadingSession) {
        let vm = RSVPViewModel(store: store)
        if let url = store.resolvedURL(for: session) {
            let accessing = url.startAccessingSecurityScopedResource()
            vm.load(url: url, bookmarkData: session.bookmarkData)
            if accessing { url.stopAccessingSecurityScopedResource() }
            activeViewModel = vm
            isReading = true
        } else {
            showingPicker = true
        }
    }
}

// MARK: - Session Row

struct SessionRow: View {
    let session: ReadingSession
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 8) {
                Text(session.title)
                    .font(.headline)
                    .foregroundColor(.primary)
                    .lineLimit(2)

                ProgressView(value: session.progress)
                    .tint(session.progress >= 1 ? .green : .blue)

                HStack {
                    Text(session.progressText)
                    Spacer()
                    Label("\(Int(session.wpm)) WPM", systemImage: "speedometer")
                }
                .font(.caption)
                .foregroundColor(.secondary)

                Text(session.lastOpened, style: .relative) + Text(" ago")
            }
            .font(.caption)
            .foregroundColor(.secondary)
            .padding(.vertical, 4)
        }
    }
}

// MARK: - Reader Screen

struct ReaderScreen: View {
    @ObservedObject var viewModel: RSVPViewModel
    @Environment(\.dismiss) var dismiss

    var body: some View {
        NavigationView {
            RSVPView(viewModel: viewModel)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .navigationBarLeading) {
                        Button("Done") {
                            viewModel.pause()
                            dismiss()
                        }
                    }
                    ToolbarItem(placement: .principal) {
                        Text(viewModel.title)
                            .font(.headline)
                            .lineLimit(1)
                    }
                }
        }
        .navigationViewStyle(.stack)
    }
}
