export default function PrivacyPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-16 text-white">
      <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
      <p className="text-gray-400 mb-10 text-sm">Last updated: June 24, 2026</p>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">1. Introduction</h2>
        <p className="text-gray-300 leading-relaxed">
          PlayMyJam ("we", "our", or "us") operates the PlayMyJam platform, which allows venue
          guests to request songs and venue administrators to manage music playback via Spotify.
          This Privacy Policy explains how we collect, use, and protect your information.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">2. Information We Collect</h2>
        <ul className="text-gray-300 leading-relaxed list-disc list-inside space-y-2">
          <li>
            <strong>Spotify account data:</strong> When a venue administrator connects their
            Spotify account, we receive and store access tokens, refresh tokens, and basic
            profile information (display name, Spotify user ID) via Spotify&apos;s OAuth flow.
          </li>
          <li>
            <strong>Song requests:</strong> We store song request data (track name, artist,
            Spotify track ID) submitted by venue guests.
          </li>
          <li>
            <strong>Usage data:</strong> We may collect anonymized usage statistics to improve
            the platform.
          </li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">3. How We Use Your Information</h2>
        <ul className="text-gray-300 leading-relaxed list-disc list-inside space-y-2">
          <li>To enable Spotify playback control on behalf of connected venue accounts.</li>
          <li>To display and manage song queues within the venue experience.</li>
          <li>To improve platform performance and reliability.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">4. Spotify Integration</h2>
        <p className="text-gray-300 leading-relaxed">
          PlayMyJam uses the Spotify Web API and Web Playback SDK. By connecting your Spotify
          account, you authorize us to control playback, read your currently playing track, and
          manage queues on your behalf. We do not sell or share your Spotify data with third
          parties. You can revoke access at any time from your{" "}
          <a
            href="https://www.spotify.com/account/apps/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-purple-400 underline"
          >
            Spotify account settings
          </a>
          .
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">5. Data Retention</h2>
        <p className="text-gray-300 leading-relaxed">
          Spotify tokens are stored securely and deleted when a venue disconnects their Spotify
          account. Song request history may be retained for up to 30 days for operational
          purposes.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">6. Data Security</h2>
        <p className="text-gray-300 leading-relaxed">
          We use industry-standard security measures including encrypted storage and secure
          HTTPS connections. Spotify credentials are never stored in plaintext.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">7. Contact</h2>
        <p className="text-gray-300 leading-relaxed">
          For privacy-related inquiries, contact us at:{" "}
          <a href="mailto:taneryldrm111@gmail.com" className="text-purple-400 underline">
            taneryldrm111@gmail.com
          </a>
        </p>
      </section>
    </main>
  );
}
