const LINKS = [
  { label: 'Fan Content Policy', href: 'https://company.wizards.com/en/legal/fancontentpolicy' },
  { label: 'Scryfall', href: 'https://scryfall.com' },
  { label: 'EDHREC', href: 'https://edhrec.com' },
  { label: 'License', href: 'https://staging.crankmagic.com/#license' },
  { label: 'Disclaimer', href: 'https://staging.crankmagic.com/#disclaimer' },
  { label: 'Third-party notices', href: 'https://staging.crankmagic.com/#notices' },
  { label: 'Privacy', href: 'https://staging.crankmagic.com/privacy.html' },
  { label: 'Terms', href: 'https://staging.crankmagic.com/terms.html' },
  { label: 'Contact', href: 'mailto:admin@crankmagic.com' },
];

export function AppFooter() {
  return (
    <footer className="border-t border-border/70 bg-background/60">
      <div className="mx-auto max-w-[1400px] space-y-3 px-5 py-6 text-xs text-muted-foreground">
        <p className="max-w-3xl leading-relaxed">
          CrankMagic is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC. Card data and images courtesy of Scryfall; deck insights courtesy of EDHREC. Prototype card images are four supplied placeholders, shown unaltered.
        </p>
        <nav className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Footer">
          {LINKS.map((l) => (
            <a key={l.label} href={l.href} className="hover:text-foreground hover:underline" data-testid={`link-footer-${l.label.toLowerCase().replace(/\s+/g, '-')}`}>
              {l.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
