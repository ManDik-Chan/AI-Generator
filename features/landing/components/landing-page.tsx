import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import type { ArtKey } from "@/features/landing/art";
import { landingCopy, type LandingLang } from "@/features/landing/content";
import { LandingRuntime } from "@/features/landing/components/landing-runtime";
import { avatar, Chars, Icon, IconSprite, Img, Leaves, Loop, Roll, vars, type LandingIcon } from "@/features/landing/components/primitives";

/* ------------------------------------------------------------- helpers */

const Art = ({ k, className, children, media = false, delay }: { k: ArtKey; className: string; children?: ReactNode; media?: boolean; delay?: number }) =>
  media ? (
    <div className={className} data-media="" style={delay ? vars({ "--d": delay }) : undefined}>
      <div className="media__in art" data-art={k} />
      {children}
    </div>
  ) : (
    <div className={`${className} art`} data-art={k}>{children}</div>
  );

/** One merged "gooey" surface behind a group of [data-goo-item] blocks (shape drawn by the runtime). */
const GooLayer = ({ count }: { count: number }) => (
  <svg aria-hidden="true" className="goo" focusable="false">
    <g filter="url(#lp-goo)">{Array.from({ length: count }, (_, i) => <rect key={i} />)}</g>
  </svg>
);

const A = ({
  href, className, children, label, style, attrs,
}: { href: string; className?: string; children: ReactNode; label?: string; style?: CSSProperties; attrs?: Record<string, string> }) => (
  <Link aria-label={label} className={className} href={href} prefetch={false} style={style} {...attrs}>{children}</Link>
);

function SplitCta({ href, icon, label }: { href: string; icon: LandingIcon; label: string }) {
  return (
    <A className="cta" href={href}>
      <span className="cta__host" data-goo="">
        <GooLayer count={2} />
        <span className="cta__icon" data-goo-item=""><Loop dir="up" name={icon} /></span>
        <span className="cta__label" data-goo-item=""><Roll text={label} /></span>
      </span>
    </A>
  );
}

function Catalog({ href, title, sub, thumb }: { href: string; title: string; sub: string; thumb: ReactNode }) {
  return (
    <A className="catalog" href={href}>
      <span className="catalog__txt"><b>{title}</b><span>{sub} <Loop dir="dr" name="dr" /></span></span>
      {thumb}
    </A>
  );
}

function Chapter({
  art, tag, tagColor, icon, title, cta, href, hint, catalog, children,
}: {
  art: ArtKey; tag: string; tagColor: string; icon: LandingIcon; title: [string, string]; cta: string; href: string;
  hint: string; catalog: ReactNode; children: ReactNode;
}) {
  return (
    <article className="chapter" data-chapter="">
      <div className="chapter__bg art" data-art={art} data-chapter-bg="" />
      <div className="chapter__shade" />
      <div className="chapter__grid">
        <div className="chapter__text">
          <span className="tag" style={vars({ "--tag": tagColor })}><Icon name={icon} />{tag}</span>
          <h2 className="chapter__title">{title[0]}<br />{title[1]}</h2>
          <SplitCta href={href} icon={icon} label={cta} />
        </div>
        <div aria-hidden="true" className="chapter__comp">{children}</div>
      </div>
      <p className="chapter__hint">{hint} <Icon name="down" /></p>
      {catalog}
    </article>
  );
}

/* ---------------------------------------------------------------- page */

export function LandingPage({ lang }: { lang: LandingLang }) {
  const c = landingCopy[lang];
  const ch = c.chapters;

  return (
    <div className="lp is-loading" data-landing="" lang={lang === "en" ? "en" : "zh-CN"}>
      <IconSprite />

      {/* Preloader */}
      <div aria-hidden="true" className="preloader" data-preloader="">
        <Icon className="preloader__mark" name="twin" />
        <p className="preloader__line">{c.preloader[0]}<br />{c.preloader[1]}</p>
        <p className="preloader__num odo" data-odo="">
          <span className="odo__col odo__col--h"><span className="odo__stack"><span>1</span></span></span>
          {["t", "o"].map((k) => (
            <span className="odo__col" key={k}><span className="odo__stack" data-odo-col={k}>{"0123456789".split("").map((d) => <span key={d}>{d}</span>)}</span></span>
          ))}
        </p>
      </div>

      {/* Header */}
      <header className="header" data-header="" data-tone="light">
        <A className="brand" href="/" label={c.header.home}>
          <Icon className="brand__mark" name="spark" />
          <span className="brand__word"><Roll text="AI-Generator" /><sup>®</sup></span>
        </A>
        <div className="header__right">
          <nav aria-label={c.header.mainNav} className="nav">
            <div className="nav__group" data-goo="">
              <GooLayer count={c.header.links.length} />
              {c.header.links.map((l) => (
                <A attrs={{ "data-goo-item": "" }} className="pill" href={l.href} key={l.href}><Roll text={l.label} /></A>
              ))}
            </div>
            <A className="pill pill--ink" href="/login"><Roll text={c.header.login} /></A>
          </nav>
          <div className="lang" data-lang="">
            <button aria-controls="lp-lang-menu" aria-expanded="false" aria-haspopup="true" aria-label={c.header.langLabel} className="lang__btn" data-lang-btn="" type="button">
              <Roll text={c.header.langCurrent} /><Icon className="lang__chev" name="chev" />
            </button>
            <div className="lang__menu" data-lang-menu="" id="lp-lang-menu" role="menu">
              {(["zh", "en"] as const).map((code) => (
                <button aria-checked={code === lang} data-set-lang={code} key={code} role="menuitemradio" type="button">
                  <Roll text={code === "zh" ? "简体中文" : "English"} /><i className="lang__dot" />
                </button>
              ))}
            </div>
          </div>
          <button aria-controls="lp-menu" aria-expanded="false" aria-label={c.header.menuOpen} className="pill menu-btn" data-label-close={c.header.menuClose} data-label-open={c.header.menuOpen} data-menu-btn="" type="button">
            <span aria-hidden="true" className="menu-btn__label"><span>{c.header.menu}</span><span>{c.header.close}</span></span>
            <i aria-hidden="true" className="burger"><i /><i /></i>
          </button>
        </div>
      </header>
      <div aria-hidden="true" className="curtain" />

      {/* Mobile menu */}
      <div className="menu" data-menu="" id="lp-menu" inert>
        <nav aria-label={c.menu.label} className="menu__links">
          {c.menu.links.map((l, k) => (
            <A href={l.href} key={l.href} style={vars({ "--k": k })}><Roll text={l.label} /></A>
          ))}
        </nav>
        <div className="menu__foot">
          <A className="pill pill--ink" href="/login"><Roll text={c.header.login} /></A>
          <A className="pill" href="/register"><Roll text={c.menu.register} /></A>
        </div>
      </div>

      <main>
        <div className="intro">
          {/* Hero */}
          <section aria-labelledby="lp-hero-title" className="hero">
            <div aria-hidden="true" className="hero__field"><div className="hero__cam" data-cam="" /></div>
            <div className="hero__shade" data-hero-shade="" />
            <div className="hero__center" data-hero-center="">
              <h1 className="hero__title t-display" id="lp-hero-title">
                <span className="line"><span>{c.hero.lines[0]}</span></span>
                <span className="line" style={vars({ "--d": 110 })}><span>{c.hero.lines[1]}</span></span>
              </h1>
            </div>
            <div className="hero__foot">
              <p>{c.hero.foot[0]}<br />{c.hero.foot[1]}</p>
              <p className="hero__scroll">{c.hero.scroll} <Icon name="down" /></p>
            </div>
          </section>

          {/* Pinned chapters — platform capabilities; the small product shots are illustrative */}
          <section aria-label={ch.label} className="chapters" data-chapters="" data-theme="dark" style={vars({ "--n": 5 })}>
            <div className="chapters__sticky">
              <Chapter
                art="memory" catalog={<Catalog href="/explore" sub={ch.showcase.catalog[1]} thumb={<span className="catalog__thumb art" data-art="tide" />} title={ch.showcase.catalog[0]} />}
                cta={ch.showcase.cta} hint={ch.hint} href="/explore" icon="folder" tag={ch.showcase.tag} tagColor="#B8C6EA" title={ch.showcase.title}
              >
                <div className="panel comp-memory">
                  <div className="panel__head"><span>{ch.showcase.head[0]}</span><span>{ch.showcase.head[1]}</span></div>
                  {ch.showcase.claims.map((m) => (
                    <div className="mitem" key={m.text}>
                      <p>{m.text}</p><small>{m.meta}</small>
                      <span className="acts">{m.ok ? <span className="badge-ok"><Icon name="check" />{m.status}</span> : <span className="btn-xs">{m.status}</span>}</span>
                    </div>
                  ))}
                </div>
              </Chapter>

              <Chapter
                art="persona" catalog={<Catalog href="/demos/neural-network" sub={ch.lab.catalog[1]} thumb={<span className="catalog__thumb art" data-art="bloom" />} title={ch.lab.catalog[0]} />}
                cta={ch.lab.cta} hint={ch.hint} href="/demos" icon="flask" tag={ch.lab.tag} tagColor="#B9CDB2" title={ch.lab.title}
              >
                <div className="panel comp-gen">
                  <div className="gen__prompt"><Icon name="flask" />{ch.lab.prompt}</div>
                  <div className="gen__img art" data-art="tide"><i className="gen__scan" /></div>
                  <div className="gen__meta"><span>{ch.lab.status}</span><span>{ch.lab.meta}</span></div>
                  <div className="gen__bar"><i /></div>
                </div>
              </Chapter>

              <Chapter
                art="agents" catalog={<Catalog href="/docs" sub={ch.publish.catalog[1]} thumb={<span className="catalog__thumb art" data-art="stone" />} title={ch.publish.catalog[0]} />}
                cta={ch.publish.cta} hint={ch.hint} href="/docs/manifest" icon="doc" tag={ch.publish.tag} tagColor="#E9E778" title={ch.publish.title}
              >
                <svg className="comp-graph" viewBox="0 0 400 320">
                  <g className="graph__lines">
                    {[52, 127, 202, 277].map((y, i) => <path d={`M150 ${y}C${i % 3 ? 200 : 205} ${y} ${i % 3 ? 205 : 200} 160 252 160`} key={y} />)}
                  </g>
                  {ch.publish.nodes.map((label, i) => {
                    const y = 30 + i * 75;
                    return (
                      <g className="graph__node" key={label}>
                        <rect height="44" rx="22" width="150" x="0" y={y} />
                        <circle className={i < 3 ? "dot dot--done" : "dot dot--run"} cx="22" cy={y + 22} r="5" />
                        <text x="36" y={y + 27}>{label}</text>
                      </g>
                    );
                  })}
                  <g className="graph__lead">
                    <rect height="72" rx="20" width="148" x="252" y="124" />
                    <text x="272" y="155">{ch.publish.lead[0]}</text>
                    <text className="sub" x="272" y="176">{ch.publish.lead[1]}</text>
                  </g>
                </svg>
              </Chapter>

              <Chapter
                art="image" catalog={<Catalog href="/platform/connections" sub={ch.privacy.catalog[1]} thumb={<span className="catalog__thumb art" data-art="ember" />} title={ch.privacy.catalog[0]} />}
                cta={ch.privacy.cta} hint={ch.hint} href="/platform/connections" icon="key" tag={ch.privacy.tag} tagColor="#F2C2AE" title={ch.privacy.title}
              >
                <div className="comp-persona">
                  {ch.privacy.cards.map((p, i) => (
                    <div className="pcard" key={p.name}>
                      <span className="pcard__mark"><Icon name={(["eye", "lock", "key"] as const)[i]} /></span>
                      <div><b>{p.name}</b><small>{p.desc}</small><span className="chips"><span>{p.chips[0]}</span><span>{p.chips[1]}</span></span></div>
                    </div>
                  ))}
                </div>
              </Chapter>

              <Chapter
                art="chat" catalog={<Catalog href="/platform/agent" sub={ch.hub.catalog[1]} thumb={<span className="catalog__thumb art" data-art="agents" />} title={ch.hub.catalog[0]} />}
                cta={ch.hub.cta} hint={ch.hint} href="/platform/hub" icon="chat" tag={ch.hub.tag} tagColor="#EDB08F" title={ch.hub.title}
              >
                <div className="comp-chat">
                  <div className="bubble bubble--user">{ch.hub.user}</div>
                  <div className="bubble bubble--ai">
                    <span className="bubble__who"><Img src={avatar(3)} />{ch.hub.persona}</span>
                    {ch.hub.intro}
                    <ol>{ch.hub.points.map((p) => <li key={p}>{p}</li>)}</ol>
                  </div>
                  <div className="typing"><i /><i /><i /></div>
                </div>
              </Chapter>

              <div aria-hidden="true" className="chapters__index">
                <div className="roll"><div className="roll__track" data-roll-track="">{["01", "02", "03", "04", "05"].map((n) => <span key={n}>{n}</span>)}</div></div>
                <div className="chapters__bar"><i data-chapters-bar="" /></div>
                <p>{ch.index}</p>
              </div>
            </div>
          </section>
        </div>

        {/* About — platform narrative and honest roadmap cards */}
        <section className="about" data-theme="light">
          <div className="rule" data-rule="" />
          <div className="grid">
            <div className="about__main">
              <p className="about__meta" data-reveal="">AI-Generator<sup>®</sup><br />{c.about.meta[1]}<br />{c.about.meta[2]}</p>
              <Art className="about__img" k="stone" media />
              <p className="about__text" data-chars=""><Chars lines={[c.about.text]} /></p>
            </div>
            <aside aria-labelledby="lp-news-title" className="about__side">
              <p className="label" id="lp-news-title">{c.about.news} <Icon name="down" /></p>
              <div className="news">
                {c.about.cards.map((card, i) => (
                  <A attrs={{ "data-reveal": "" }} className="news__card" href={card.href} key={card.title} style={vars({ "--d": i * 120 })}>
                    <Art className="news__img" delay={i * 120} k={i ? "image" : "agents"} media />
                    <span className="news__title"><span className="ul">{card.title}</span></span>
                    <span className="news__meta">{card.meta}</span>
                  </A>
                ))}
              </div>
            </aside>
          </div>
        </section>

        {/* Feature cards */}
        <section aria-labelledby="lp-features-title" className="features" data-theme="light">
          <p className="label features__label" id="lp-features-title">{c.features.label} <Icon name="down" /></p>
          <div className="features__grid">
            <A attrs={{ "data-reveal": "" }} className="fcard" href="/explore">
              <span className="fcard__top"><span className="tag tag--sm" style={vars({ "--tag": "#B8C6EA" })}><Icon name="folder" />{c.features.explore.tag}</span><Loop className="fcard__arrow" dir="ur" name="ur" /></span>
              <span className="fcard__title">{c.features.explore.title}</span>
              <span className="fcard__stage fcard__stage--fan">
                {(["tide", "citron", "bloom"] as const).map((k) => <span className="fan art" data-art={k} key={k} />)}
              </span>
              <span className="fcard__bottom">
                <span><small>{c.features.explore.styles}</small><span className="swatches">{["#2F6F7E", "#7F8A2A", "#8E4D8F", "#A3452A"].map((col) => <i key={col} style={vars({ "--c": col })} />)}<em>+2</em></span></span>
                <span className="pill pill--ink fcard__go"><Roll text={c.features.explore.go} /><Loop dir="right" name="right" /></span>
              </span>
            </A>
            <A attrs={{ "data-reveal": "" }} className="fcard" href="/platform/hub" style={vars({ "--d": 120 })}>
              <span className="fcard__top"><span className="tag tag--sm" style={vars({ "--tag": "#EDB08F" })}><Icon name="spark" />{c.features.hub.tag}</span><Loop className="fcard__arrow" dir="ur" name="ur" /></span>
              <span className="fcard__title">{c.features.hub.title}</span>
              <span className="fcard__stage fcard__stage--avatars">
                {Array.from({ length: 12 }, (_, i) => <Img key={i} src={avatar(i + 1)} style={vars({ "--i": i + 1 })} />)}
              </span>
              <span className="fcard__bottom">
                <span><small>{c.features.hub.avatars}</small><span className="swatches swatches--avatars">{[2, 4, 6, 8].map((n) => <Img key={n} src={avatar(n)} />)}<em>+8</em></span></span>
                <span className="pill pill--ink fcard__go"><Roll text={c.features.hub.go} /><Loop dir="right" name="right" /></span>
              </span>
            </A>
            {/* Runnable demos: one server-executed, one in-browser; the tiles are illustrative */}
            <A attrs={{ "data-reveal": "" }} className="fcard fcard--wide" href="/demos" style={vars({ "--d": 240 })}>
              <span className="fcard__top"><span className="tag tag--sm" style={vars({ "--tag": "#B9CDB2" })}><Icon name="flask" />{c.features.demos.tag}</span><Loop className="fcard__arrow" dir="ur" name="ur" /></span>
              <span className="fcard__title">{c.features.demos.title}</span>
              <span aria-hidden="true" className="fcard__stage fcard__stage--demos">
                {c.features.demos.items.map((item, i) => (
                  <span className="demo-tile" key={item.name}>
                    <span className="demo-tile__art art" data-art={i ? "bloom" : "tide"} />
                    {i === 0 ? (
                      <svg className="demo-tile__viz" viewBox="0 0 200 120">
                        <path className="demo-route" d="M28 30 L62 18 L104 34 L150 22 L178 52 L160 92 L116 100 L84 82 L44 96 L20 64 Z" />
                        {[[28, 30], [62, 18], [104, 34], [150, 22], [178, 52], [160, 92], [116, 100], [84, 82], [44, 96], [20, 64]].map(([x, y], k) => <circle cx={x} cy={y} key={k} r={k ? 3.2 : 5} />)}
                      </svg>
                    ) : (
                      <svg className="demo-tile__viz demo-tile__viz--nn" viewBox="0 0 200 120">
                        <path className="demo-boundary" d="M14 86 C 56 92, 70 30, 104 46 S 158 98, 188 34" />
                        {[[30, 60], [46, 44], [62, 70], [80, 36], [96, 62], [120, 30], [136, 52], [70, 96], [110, 88], [150, 92], [168, 70], [182, 96]].map(([x, y], k) => <circle className={k < 7 ? "dot-a" : "dot-b"} cx={x} cy={y} key={k} r={3.4} />)}
                      </svg>
                    )}
                    <span className="demo-tile__label"><b>{item.name}</b><small>{item.meta}</small></span>
                  </span>
                ))}
              </span>
              <span className="fcard__bottom">
                <span><small>{c.features.demos.runtimes}</small><span className="chips demo-chips"><span>{c.features.demos.chips[0]}</span><span>{c.features.demos.chips[1]}</span></span></span>
                <span className="pill pill--ink fcard__go"><Roll text={c.features.demos.go} /><Loop dir="right" name="right" /></span>
              </span>
            </A>
          </div>
        </section>

        {/* Index list */}
        <section aria-labelledby="lp-index-title" className="index" data-theme="light">
          <Leaves />
          <p className="label index__label" id="lp-index-title">{c.index.label}</p>
          <ul className="index__list">
            {c.index.rows.map((row, i) => {
              const icons: LandingIcon[] = ["compass", "folder", "flask", "doc", "key", "spark"];
              const arts: (ArtKey | null)[] = ["tide", null, "memory", "stone", "ember", "agents"];
              const art = arts[i];
              const thumb = art ? <span className="index__thumb art" data-art={art} /> : <span className="index__thumb index__thumb--avatar"><Img src={avatar(7)} /></span>;
              const thumbFirst = i % 2 === 1;
              return (
                <li key={row.href}>
                  <A className="index__row" href={row.href}>
                    <Icon className="index__icon" name={icons[i]} />
                    {thumbFirst ? thumb : null}
                    <span>{row.word}</span>
                    {thumbFirst ? null : thumb}
                    <Roll className="index__num" text={`(0${i + 1})`} />
                  </A>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Forest — the privacy boundaries of the platform */}
        <section aria-labelledby="lp-forest-quote" className="forest" data-theme="dark">
          <div className="grid forest__grid">
            <div className="forest__left">
              <div className="forest__top">
                <div className="forest__who" data-reveal="">
                  <span className="forest__avatar"><Icon name="twin" /></span>
                  <span><b>{c.forest.name}</b><small>{c.forest.role}</small></span>
                </div>
                <div className="forest__copy" data-reveal="" style={vars({ "--d": 120 })}>
                  <p>{c.forest.copy[0]}</p>
                  <p>{c.forest.copy[1]}</p>
                </div>
              </div>
              <div className="forest__bottom">
                <h2 className="forest__quote t-h2" data-chars="" id="lp-forest-quote"><Chars lines={c.forest.quote} /></h2>
                <A className="link" href="/platform/connections"><Roll text={c.forest.link} /><Loop dir="right" name="right" /></A>
              </div>
            </div>
            <figure className="forest__right">
              <div className="forest__media" data-media="">
                <div className="forest__img art" data-art="persona" data-parallax="" />
                <div aria-hidden="true" className="panel forest__panel">
                  <div className="panel__head"><span>{c.forest.panel.title}</span><Icon name="lock" /></div>
                  {c.forest.panel.rows.map(([k, v]) => <div className="brow" key={k}><span>{k}</span><em>{v}</em></div>)}
                </div>
              </div>
              <figcaption>www.ai-mdc.com</figcaption>
            </figure>
          </div>
        </section>

        {/* Process */}
        <section aria-label={c.process.label} className="process" data-theme="light">
          <div className="process__grid">
            <article className="step">
              <Art className="step__media" k="stone" media>
                <div aria-hidden="true" className="mock-composer">
                  <span className="mock-chip"><Img src={avatar(1)} />{c.process.composer.persona}</span>
                  <div className="mock-input"><span>{c.process.composer.input}</span><i><Icon name="send" /></i></div>
                </div>
              </Art>
              <div className="step__bar" />
              <div className="step__txt" data-reveal=""><h3>{c.process.steps[0][0]}</h3><p>{c.process.steps[0][1]}</p></div>
            </article>
            <article className="step">
              <Art className="step__media" delay={120} k="agents" media>
                <div aria-hidden="true" className="mock-workers">
                  {c.process.workers.labels.map((l, i) => <span key={l}><i className={i < 2 ? "dot dot--done" : "dot dot--run"} />{l}</span>)}
                  <b>{c.process.workers.lead}</b>
                </div>
              </Art>
              <div className="step__bar" />
              <div className="step__txt" data-reveal="" style={vars({ "--d": 120 })}><h3>{c.process.steps[1][0]}</h3><p>{c.process.steps[1][1]}</p></div>
            </article>
            <article className="step">
              <Art className="step__media" delay={240} k="memory" media>
                <div aria-hidden="true" className="panel mock-history">
                  {c.process.history.map(([k, v]) => <div className="hrow" key={k}><span>{k}</span><em>{v}</em></div>)}
                </div>
              </Art>
              <div className="step__bar" />
              <div className="step__txt" data-reveal="" style={vars({ "--d": 240 })}><h3>{c.process.steps[2][0]}</h3><p>{c.process.steps[2][1]}</p></div>
            </article>
          </div>
        </section>

        {/* Closing */}
        <section aria-labelledby="lp-closing-title" className="closing" data-theme="light">
          <Leaves low />
          <div className="grid closing__grid">
            <h2 className="closing__title t-h2" data-reveal="" id="lp-closing-title">
              <span className="line"><span>{c.closing.title[0]}</span></span>
              <span className="line" style={vars({ "--d": 90 })}><span>{c.closing.title[1]}</span></span>
            </h2>
            <div className="closing__cta" data-reveal="" style={vars({ "--d": 150 })}>
              <p>{c.closing.lead[0]}<br />{c.closing.lead[1]}</p>
              <A className="field" href="/login"><Roll text={c.closing.field} /><span className="field__btn" data-magnetic="0.3"><Loop dir="right" name="right" /></span></A>
              <p className="closing__small">{c.closing.small[0]}<A className="ul-link" href="/register">{c.closing.small[1]}</A>{c.closing.small[2]}</p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="footer" data-theme="lime">
        <div className="footer__grid">
          <div aria-hidden="true" className="footer__mark"><Icon className="footer__mark-svg" name="twin" /></div>
          <div className="footer__right">
            <svg aria-hidden="true" className="footer__art" viewBox="0 0 640 200">
              <path className="draw" d="M0 184H640" />
              <g className="footer__obj">
                <path d="M95 184V78" /><rect height="56" rx="12" width="112" x="40" y="22" /><path d="M78 78l-6 13 18-13" />
                <circle className="blink" cx="72" cy="50" r="4" /><circle className="blink" cx="96" cy="50" r="4" /><circle className="blink" cx="120" cy="50" r="4" />
                <path d="M80 184h30" />
              </g>
              <g className="footer__obj">
                <path d="M282 184 312 64M362 184 332 64M322 184v-62M290 146h64" />
                <rect height="84" rx="3" width="108" x="268" y="36" />
                <path className="twinkle" d="M322 58c1 6 4 9 10 10-6 1-9 4-10 10-1-6-4-9-10-10 6-1 9-4 10-10Z" />
              </g>
              <g className="footer__obj">
                <path d="M444 162h178M454 162v22M612 162v22" />
                <rect height="82" rx="6" width="122" x="474" y="54" /><path d="M535 136v26M512 162h46" />
                <path className="type-line" d="M490 78h74" /><path className="type-line" d="M490 96h88" /><path className="type-line" d="M490 114h52" />
              </g>
            </svg>
            <div className="footer__cols">
              {c.footer.cols.map((col) => (
                <div key={col.title}>
                  <h4>{col.title}</h4>
                  {col.links.map((l) => <A href={l.href} key={l.href}><Roll text={l.label} /></A>)}
                </div>
              ))}
              <div>
                <h4>{c.footer.site}</h4>
                <a href="https://www.ai-mdc.com" rel="noopener"><Roll text="www.ai-mdc.com" /></a>
                <a href="https://github.com/ManDik-Chan/AI-Generator" rel="noopener"><Roll text="GitHub" /></a>
              </div>
            </div>
          </div>
        </div>
        <div className="rule rule--ink" data-rule="" />
        <div className="footer__bottom"><span>{c.footer.bottom[0]}</span><span>{c.footer.bottom[1]}</span></div>
      </footer>

      <A attrs={{ "data-magnetic": "0.35" }} className="fab" href="/chat" label={c.fab}><Icon className="fab__mark" name="spark" /></A>

      <LandingRuntime chips={c.runtime.chips} bubbles={c.runtime.bubbles} lang={lang} />
    </div>
  );
}
