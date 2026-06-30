export default function TermsPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-16 text-white">
      <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
      <p className="text-gray-400 mb-10 text-sm">Last updated: June 24, 2026</p>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">1. Acceptance of Terms</h2>
        <p className="text-gray-300 leading-relaxed">
          By using PlayMyJam, you agree to these Terms of Service. If you do not agree, do not
          use the platform. These terms apply to all users, including venue administrators and
          guests.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">2. Description of Service</h2>
        <p className="text-gray-300 leading-relaxed">
          PlayMyJam is a music request platform that allows venue guests to suggest songs and
          venue administrators to manage music playback through their connected Spotify account.
          The service requires a valid Spotify Premium account for playback functionality.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">3. Spotify Requirements</h2>
        <p className="text-gray-300 leading-relaxed">
          Venue administrators must have an active Spotify Premium subscription to use playback
          features. PlayMyJam operates in accordance with the{" "}
          <a
            href="https://developer.spotify.com/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="text-purple-400 underline"
          >
            Spotify Developer Terms of Service
          </a>
          . Users are responsible for complying with Spotify&apos;s own terms of use.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">4. Acceptable Use</h2>
        <ul className="text-gray-300 leading-relaxed list-disc list-inside space-y-2">
          <li>You may not use PlayMyJam for any unlawful purpose.</li>
          <li>You may not attempt to manipulate or abuse the song request system.</li>
          <li>You may not request content that is harmful, offensive, or violates third-party rights.</li>
          <li>Venue administrators are responsible for content played at their venue.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">5. Intellectual Property</h2>
        <p className="text-gray-300 leading-relaxed">
          All music content is provided through Spotify and subject to their licensing
          agreements. PlayMyJam does not host, store, or distribute any audio content.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">6. Limitation of Liability</h2>
        <p className="text-gray-300 leading-relaxed">
          PlayMyJam is provided "as is" without warranties of any kind. We are not liable for
          service interruptions, Spotify API outages, or any indirect damages arising from your
          use of the platform.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">7. Changes to Terms</h2>
        <p className="text-gray-300 leading-relaxed">
          We may update these terms at any time. Continued use of PlayMyJam after changes
          constitutes acceptance of the new terms.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">8. Contact</h2>
        <p className="text-gray-300 leading-relaxed">
          For questions about these terms, contact us at:{" "}
          <a href="mailto:taneryldrm111@gmail.com" className="text-purple-400 underline">
            taneryldrm111@gmail.com
          </a>
        </p>
      </section>
    </main>
  );
}
