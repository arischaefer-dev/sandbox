import SwiftUI

struct RSVPView: View {
    @ObservedObject var viewModel: RSVPViewModel

    var body: some View {
        GeometryReader { geo in
            VStack(spacing: 0) {
                progressSection
                    .padding(.horizontal)
                    .padding(.top, 12)

                Spacer()
                centerContent
                Spacer()

                controlsSection
                    .padding(.horizontal)
                    .padding(.bottom, max(geo.safeAreaInsets.bottom, 16))
            }
        }
        .background(Color(.systemBackground).ignoresSafeArea())
    }

    // MARK: - Progress

    private var progressSection: some View {
        VStack(spacing: 4) {
            ProgressView(value: viewModel.progress)
                .tint(viewModel.isFinished ? .green : .blue)
                .animation(.linear(duration: 0.1), value: viewModel.progress)
            Text(viewModel.progressText)
                .font(.caption)
                .foregroundColor(.secondary)
                .monospacedDigit()
        }
    }

    // MARK: - Center content

    @ViewBuilder
    private var centerContent: some View {
        if viewModel.isLoading {
            VStack(spacing: 16) {
                ProgressView().scaleEffect(1.5)
                Text("Extracting text…").foregroundColor(.secondary)
            }
        } else if let err = viewModel.errorMessage {
            VStack(spacing: 12) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.largeTitle).foregroundColor(.orange)
                Text(err).multilineTextAlignment(.center).padding(.horizontal, 32)
            }
        } else if viewModel.isFinished {
            finishedOverlay
        } else {
            ORPWordView(word: viewModel.currentWord)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 24)
        }
    }

    private var finishedOverlay: some View {
        VStack(spacing: 20) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 72)).foregroundColor(.green)
            Text("Finished!").font(.title.bold())
            Button("Read Again") { viewModel.seekToStart() }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
        }
    }

    // MARK: - Controls

    private var controlsSection: some View {
        VStack(spacing: 20) {
            wpmControl
            playbackButtons
        }
        .padding(.vertical, 16)
    }

    private var wpmControl: some View {
        HStack(spacing: 16) {
            Button { viewModel.setWPM(viewModel.wpm - 25) } label: {
                Image(systemName: "minus.circle.fill").font(.title2)
            }
            .disabled(viewModel.wpm <= 60)

            VStack(spacing: 2) {
                Text("\(Int(viewModel.wpm))")
                    .font(.system(.title2, design: .rounded).monospacedDigit().bold())
                Text("WPM")
                    .font(.caption2).foregroundColor(.secondary)
            }
            .frame(width: 72)

            Button { viewModel.setWPM(viewModel.wpm + 25) } label: {
                Image(systemName: "plus.circle.fill").font(.title2)
            }
            .disabled(viewModel.wpm >= 800)
        }
        .foregroundColor(.primary)
    }

    private var playbackButtons: some View {
        HStack(spacing: 40) {
            stepButton(delta: -10, label: "−10", icon: "backward.fill")
            playPauseButton
            stepButton(delta: 10, label: "+10", icon: "forward.fill")
        }
        .foregroundColor(.primary)
    }

    private func stepButton(delta: Int, label: String, icon: String) -> some View {
        Button { viewModel.step(by: delta) } label: {
            VStack(spacing: 3) {
                Image(systemName: icon).font(.title2)
                Text(label).font(.caption2)
            }
        }
    }

    private var playPauseButton: some View {
        Button(action: viewModel.togglePlayPause) {
            Image(systemName: viewModel.isPlaying ? "pause.circle.fill" : "play.circle.fill")
                .font(.system(size: 68))
                .foregroundColor(.blue)
        }
        .disabled(viewModel.words.isEmpty || viewModel.isLoading)
    }
}

// MARK: - ORP Word Display

struct ORPWordView: View {
    let word: String

    private static let containerWidth: CGFloat = 150

    private var orpIndex: Int {
        guard !word.isEmpty else { return 0 }
        return min(Int(ceil(Double(word.count) * 0.35)), word.count - 1)
    }

    private var beforePivot: String { String(word.prefix(orpIndex)) }
    private var pivotChar: String {
        guard !word.isEmpty else { return "" }
        return String(word[word.index(word.startIndex, offsetBy: orpIndex)])
    }
    private var afterPivot: String {
        let start = orpIndex + 1
        guard start < word.count else { return "" }
        return String(word.suffix(word.count - start))
    }

    var body: some View {
        ZStack {
            // Subtle vertical focus guide aligned with pivot
            Rectangle()
                .fill(Color.red.opacity(0.15))
                .frame(width: 3, height: 80)
                .offset(x: 0)

            HStack(alignment: .center, spacing: 0) {
                Text(beforePivot)
                    .frame(width: Self.containerWidth, alignment: .trailing)
                Text(pivotChar)
                    .foregroundColor(.red)
                    .fontWeight(.bold)
                Text(afterPivot)
                    .frame(width: Self.containerWidth, alignment: .leading)
            }
            .font(.system(size: 44, weight: .regular, design: .serif))
            .lineLimit(1)
            .minimumScaleFactor(0.4)
        }
    }
}
