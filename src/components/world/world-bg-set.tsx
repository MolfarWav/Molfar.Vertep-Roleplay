import type * as React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { toast } from 'sonner';
import { CaretDown, Check, CircleNotch } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useT } from '@/hooks/use-t';
import { resolveLanguage, type MsgKey } from '@/lib/i18n';
import { useApp } from '@/lib/store';
import {
  STYLE_CHIPS,
  PLACE_CHIPS,
  addWords,
  mergeTags,
  parseTags,
  placeTags,
  toSnake,
  uniqueName,
} from '@/lib/world-backgrounds';
import { backgroundBlob, storeBackground } from '@/lib/webp';
import { fetchImageModels } from '@/lib/engine';
import { buildImagePrompt, generateImage } from '@/lib/image-gen';
import {
  loadWorldBackgrounds,
  findWorldPlaces,
  loadWorldConfig,
  WORLD_CONFIG_EVENT,
  planWorldBackgrounds,
  type PlannedBackground,
  type WorldErrorCode,
  type WorldPlace,
  type WorldRef,
} from '@/lib/world';
import { WorldErrorCard } from './world-controls';
import { ImageModelDialog } from './world-image-model';

type PlaceEntry =
  | { id: string; kind: 'record' | 'book' | 'found'; name: string; text: string; book?: string; aliases?: string[]; ticked: boolean }
  | { id: string; kind: 'chip' | 'custom'; value: string; ticked: boolean };

type ReviewItem = {
  key: string;
  place: string;
  file: string;
  tagsText: string;
  prompt: string;
  removed: boolean;
  status: 'todo' | 'done' | 'failed' | 'skipped';
  url?: string;
  error?: string;
};

type NamedEntry = Extract<PlaceEntry, { name: string }>;
const isNamed = (e: PlaceEntry): e is NamedEntry => 'name' in e;

function entryLabel(e: PlaceEntry): string {
  return isNamed(e) ? e.name : e.value;
}

export function MakeSet({
  wref,
  folderId,
  only,
  onStored,
}: {
  wref: WorldRef;
  folderId: string;
  onOpenSettings?: () => void;
  /** a set for one place only (the Places tab): the places list is not shown, the fold is open */
  only?: { name: string; text: string; aliases: string[] };
  /** a picture of the set was drawn and stored in the library: its id and url */
  onStored?: (stored: { place: string; bgId: string; url: string }) => void;
}) {
  const t = useT();
  const lang = resolveLanguage(useApp((s) => s.settings.language));
  const imageGen = useApp((s) => s.settings.imageGen);
  const backgrounds = useApp((s) => s.backgrounds);
  const addBackground = useApp((s) => s.addBackground);
  const updateBackground = useApp((s) => s.updateBackground);

  const [open, setOpen] = useState(!!only);
  const [imgDialog, setImgDialog] = useState(false);
  const [booksAll, setBooksAll] = useState(false);
  const [finding, setFinding] = useState(false);
  const [findMsg, setFindMsg] = useState<string | null>(null);
  const [direction, setDirection] = useState('');
  const [entries, setEntries] = useState<PlaceEntry[]>([]);
  const [customPlace, setCustomPlace] = useState('');
  const [variants, setVariants] = useState<1 | 2 | 3>(1);
  const [model, setModel] = useState('');
  const [modelFrom, setModelFrom] = useState<'world' | 'app' | 'none'>('none');
  const [modelLabel, setModelLabel] = useState('');
  const [configModel, setConfigModel] = useState<string | undefined>(undefined);
  const [planBusy, setPlanBusy] = useState(false);
  const [error, setError] = useState<{ code: WorldErrorCode; message: string } | null>(null);
  const [stage, setStage] = useState<'form' | 'review' | 'finished'>('form');
  const [review, setReview] = useState<ReviewItem[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [stopped, setStopped] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  // the parent builds a new ref object each render: effects key on the ids
  const refKey = 'worldId' in wref ? `w:${wref.worldId}` : `c:${wref.chatId}`;
  const warnedRef = useRef<Set<string>>(new Set());

  // Load places on mount / wref change.
  useEffect(() => {
    let active = true;
    if (only) {
      setEntries([{ id: 'only', kind: 'record', name: only.name, text: only.text, aliases: only.aliases, ticked: true }]);
      return () => {
        active = false;
      };
    }
    loadWorldBackgrounds(wref)
      .then((res) => {
        if (!active) return;
        const list: PlaceEntry[] = (res.places ?? []).map((p: WorldPlace, idx) => ({
          id: `r-${idx}`,
          kind: 'record',
          name: p.name,
          text: p.text ?? '',
          aliases: p.aliases,
          ticked: true,
        }));
        // the places arrive late: keep what the player already added
        const taken = new Set(list.filter(isNamed).map((e) => e.name.trim().toLowerCase()));
        const books: PlaceEntry[] = [];
        (res.fromBooks ?? []).forEach((b, idx) => {
          const key = b.name.trim().toLowerCase();
          if (!key || taken.has(key)) return;
          taken.add(key);
          books.push({ id: `b-${idx}`, kind: 'book', name: b.name, text: b.text ?? '', book: b.book, ticked: false });
        });
        setEntries((prev) => [...list, ...books, ...prev.filter((e) => e.kind !== 'record' && e.kind !== 'book')]);
        setStage('form');
        setReview([]);
        setStopped(false);
        setProgress(null);
        setError(null);
      })
      .catch((e) => {
        if (!active) return;
        setError({ code: 'other', message: e instanceof Error ? e.message : String(e) });
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refKey]);

  // Reset when folderId or wref changes.
  useEffect(() => {
    setStage('form');
    setReview([]);
    setStopped(false);
    setProgress(null);
    setError(null);
  }, [folderId, refKey]);

  // Abort on unmount.
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  // The image model line: the World's own pick, else the app's. Set from a read when the fold opens and
  // from the saved config a World settings / image-model dialog hands over (no second read to land late).
  const applyImageModel = useCallback(
    (own: string | undefined, alive: () => boolean = () => true) => {
      const m = own || imageGen?.model || '';
      setModel(m);
      setConfigModel(own || undefined);
      setModelFrom(own ? 'world' : imageGen?.model ? 'app' : 'none');
      void fetchImageModels().then((all) => {
        const hit = all.find((x) => `${x.provider}/${x.id}` === m);
        if (alive()) setModelLabel(hit ? hit.favorite?.name || hit.label : m);
      });
    },
    [imageGen?.model],
  );

  useEffect(() => {
    let active = true;
    const saved = (e: Event) => applyImageModel((e as CustomEvent<{ imageModel: string }>).detail.imageModel, () => active);
    window.addEventListener(WORLD_CONFIG_EVENT, saved);
    return () => {
      active = false;
      window.removeEventListener(WORLD_CONFIG_EVENT, saved);
    };
  }, [applyImageModel]);

  // Read the image model config when the fold opens.
  useEffect(() => {
    if (!open) return;
    let active = true;
    loadWorldConfig('chatId' in wref ? wref.chatId : undefined)
      .then((cfg: { imageModel?: string }) => {
        if (active) applyImageModel(cfg.imageModel, () => active);
      })
      .catch(() => {
        if (active) applyImageModel(undefined, () => active);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, refKey, applyImageModel]);

  const takenNames = useMemo(
    () => backgrounds.filter((b) => b.folderId === folderId).map((b) => toSnake(b.name)),
    [backgrounds, folderId],
  );

  const tickedCount = useMemo(() => entries.filter((e) => e.ticked).length, [entries]);
  const costN = tickedCount * variants;

  const planPlaces = useMemo(
    () =>
      entries
        .filter((e) => e.ticked)
        .map((e) => (isNamed(e) ? { name: e.name, text: e.text, ...(e.kind === 'record' && e.aliases?.length ? { aliases: e.aliases } : {}) } : e.value)),
    [entries],
  );

  const toggleEntry = (id: string) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ticked: !e.ticked } : e)));
  };

  const toggleChip = (words: string) => {
    setEntries((prev) => {
      const existing = prev.find((e) => e.kind === 'chip' && e.value === words);
      if (existing) return prev.filter((e) => e.id !== existing.id);
      return [
        ...prev,
        { id: `chip-${words}-${Date.now()}`, kind: 'chip' as const, value: words, ticked: true },
      ];
    });
  };

  const addCustom = () => {
    const v = customPlace.trim();
    if (!v) return;
    setEntries((prev) => {
      // the same place typed twice ticks the one that is there
      const same = prev.find((e) => e.kind === 'custom' && e.value.toLowerCase() === v.toLowerCase());
      if (same) return prev.map((e) => (e.id === same.id ? { ...e, ticked: true } : e));
      return [...prev, { id: `c-${Date.now()}`, kind: 'custom' as const, value: v, ticked: true }];
    });
    setCustomPlace('');
  };

  const handlePlan = useCallback(async () => {
    if (costN === 0 || !model) return;
    setPlanBusy(true);
    setError(null);
    try {
      const res = await planWorldBackgrounds(wref, {
        places: planPlaces,
        direction,
        variants,
        taken: takenNames,
        lang,
      });
      if (!res.ok) {
        setError({ code: res.code ?? 'other', message: res.error ?? t('world.bg.planFail') });
        return;
      }
      const planned: PlannedBackground[] = res.images ?? [];
      const items: ReviewItem[] = [];
      const used = [...takenNames];
      planned.forEach((p, idx) => {
        const file = uniqueName(p.file, used);
        used.push(file);
        items.push({
          key: `${idx}-${file}`,
          place: p.place,
          file,
          tagsText: p.tags?.join(', ') ?? '',
          prompt: p.prompt,
          removed: false,
          status: 'todo',
        });
      });
      setReview(items);
      setStage('review');
    } catch (e) {
      setError({ code: 'other', message: e instanceof Error ? e.message : String(e) });
    } finally {
      setPlanBusy(false);
    }
  }, [costN, model, planPlaces, direction, variants, takenNames, lang, wref, t]);

  const handleFind = useCallback(async () => {
    setFinding(true);
    setFindMsg(null);
    setError(null);
    try {
      const res = await findWorldPlaces(wref);
      if (!res.ok) {
        if (res.code === 'no-text') setFindMsg(t('world.bg.findNoText'));
        else setError({ code: (res.code as WorldErrorCode) ?? 'other', message: res.error ?? t('world.bg.planFail') });
        return;
      }
      setEntries((prev) => {
        const shown = new Set(prev.filter(isNamed).map((e) => e.name.trim().toLowerCase()));
        const fresh: PlaceEntry[] = [];
        for (const p of res.places ?? []) {
          const key = p.name.trim().toLowerCase();
          if (!key || shown.has(key)) continue;
          shown.add(key);
          fresh.push({ id: `f-${Date.now()}-${fresh.length}`, kind: 'found', name: p.name, text: p.text ?? '', ticked: false });
        }
        setFindMsg(fresh.length ? null : t('world.bg.findNone'));
        return [...prev, ...fresh];
      });
    } catch (e) {
      setError({ code: 'other', message: e instanceof Error ? e.message : String(e) });
    } finally {
      setFinding(false);
    }
  }, [wref, t]);

  const handleReplan = useCallback(() => {
    setStage('form');
    setReview([]);
    setStopped(false);
    setProgress(null);
  }, []);

  const drawCount = useMemo(
    () => review.filter((i) => !i.removed && (i.status === 'todo' || i.status === 'failed')).length,
    [review],
  );
  const doneCount = useMemo(
    () => review.filter((i) => !i.removed && i.status === 'done').length,
    [review],
  );
  const failedCount = useMemo(
    () => review.filter((i) => !i.removed && i.status === 'failed').length,
    [review],
  );

  const startDrawing = useCallback(async () => {
    const targets = review.filter(
      (i) => !i.removed && (i.status === 'todo' || i.status === 'failed'),
    );
    if (targets.length === 0) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setDrawing(true);
    setStopped(false);
    setProgress({ done: 1, total: targets.length });
    const ig = imageGen ?? { promptPrefix: '', negativePrompt: '' };
    let finished = 0;
    let localDone = 0;
    let localFailed = 0;
    for (const item of targets) {
      if (ctrl.signal.aborted) break;
      setProgress({ done: Math.min(finished + 1, targets.length), total: targets.length });
      try {
        const img = await generateImage({
          prompt: buildImagePrompt(ig, item.prompt),
          negativePrompt: ig.negativePrompt,
          model: configModel || imageGen?.model || undefined,
          signal: ctrl.signal,
        });
        const blob = await backgroundBlob(img.url);
        const stored = await storeBackground(blob, item.file);
        const id = addBackground(item.file, stored.url);
        const own = entries.find((e): e is NamedEntry => isNamed(e) && e.kind === 'record' && e.name.trim().toLowerCase() === item.place.trim().toLowerCase());
        // the place's name and aliases are tags too: the Dashboard's tag match finds the picture by them
        updateBackground(id, { folderId, tags: own ? mergeTags(placeTags(own.name, own.aliases), parseTags(item.tagsText)) : parseTags(item.tagsText) });
        onStored?.({ place: item.place, bgId: id, url: stored.url });
        setReview((prev) =>
          prev.map((it) =>
            it.key === item.key ? { ...it, status: 'done', url: stored.url, error: undefined } : it,
          ),
        );
        localDone++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setReview((prev) =>
          prev.map((it) => (it.key === item.key ? { ...it, status: 'failed', error: msg } : it)),
        );
        localFailed++;
      }
      finished++;
    }
    setDrawing(false);
    abortRef.current = null;
    setProgress({ done: finished, total: targets.length });
    if (ctrl.signal.aborted) {
      setStopped(true);
      setStage('review');
    } else if (localFailed === 0) {
      toast.success(t('world.bg.drawn', { n: localDone }));
      setStage('finished');
    } else {
      setStage('review');
    }
  }, [review, entries, onStored, imageGen, configModel, folderId, addBackground, updateBackground, t]);

  const handleRetry = useCallback(() => {
    flushSync(() => {
      setReview((prev) =>
        prev.map((i) =>
          !i.removed && i.status === 'failed' ? { ...i, status: 'todo', error: undefined } : i,
        ),
      );
    });
    startDrawing();
  }, [startDrawing]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const recordEntries = entries.filter((e): e is NamedEntry => e.kind === 'record');
  const bookEntries = entries.filter((e) => e.kind === 'book');
  const foundEntries = entries.filter((e) => e.kind === 'found');
  const chipEntries = entries.filter((e): e is Extract<PlaceEntry, { kind: 'chip' | 'custom' }> => e.kind === 'chip' || e.kind === 'custom');
  const BOOKS_SHOWN = 12;
  const shownBooks = booksAll ? bookEntries : bookEntries.slice(0, BOOKS_SHOWN);
  const placeChip = (e: PlaceEntry) => (
    <Button
      key={e.id}
      type="button"
      role="checkbox"
      aria-checked={e.ticked}
      variant={e.ticked ? 'default' : 'outline'}
      size="sm"
      className="max-md:h-10"
      title={e.kind === 'book' && e.book ? t('world.bg.fromBook', { book: e.book }) : undefined}
      onClick={() => toggleEntry(e.id)}
    >
      {e.ticked && <Check className="size-3.5" aria-hidden="true" />}
      {entryLabel(e)}
    </Button>
  );

  return (
    <section className="space-y-4">
      {!only && <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        data-testid="bg-set-toggle"
        className="flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 max-md:min-h-12"
      >
        <span className="flex min-w-0 flex-col">
          <span className="font-medium">{t('world.bg.set')}</span>
          <span className="text-sm text-muted-foreground">{t('world.bg.setHint')}</span>
        </span>
        <CaretDown className={`size-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>}

      {open && (
        <div className="space-y-6">
          {stage === 'form' && (
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('world.bg.direction')}</label>
                <Input
                  aria-label={t('world.bg.direction')}
                  placeholder={t('world.bg.directionPh')}
                  value={direction}
                  onChange={(e) => setDirection(e.target.value)}
                  className="h-10 md:h-9"
                />
                <div className="flex flex-wrap gap-2">
                  {STYLE_CHIPS.map((chip) => (
                    <Button
                      key={chip.id}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="max-md:h-10"
                      onClick={() => setDirection((prev) => addWords(prev, chip.words))}
                    >
                      {t(`world.bg.style.${chip.id}` as MsgKey)}
                    </Button>
                  ))}
                </div>
              </div>

              {!only && <div className="space-y-2">
                <label className="text-sm font-medium">{t('world.bg.places')}</label>
                {recordEntries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('world.bg.placesNone')}</p>
                ) : (
                  <div className="flex flex-wrap gap-2">{recordEntries.map(placeChip)}</div>
                )}
                {bookEntries.length > 0 && (
                  <div className="space-y-1.5" data-testid="places-books">
                    <p className="text-xs font-medium text-muted-foreground">{t('world.bg.placesBooks')}</p>
                    <div className="flex flex-wrap gap-2">{shownBooks.map(placeChip)}</div>
                    {bookEntries.length > BOOKS_SHOWN && (
                      <button type="button" className="text-xs text-primary underline-offset-2 hover:underline max-md:min-h-10" onClick={() => setBooksAll((v) => !v)}>
                        {booksAll ? t('world.bg.showLess') : t('world.bg.showAll', { n: bookEntries.length })}
                      </button>
                    )}
                  </div>
                )}
                {foundEntries.length > 0 && (
                  <div className="space-y-1.5" data-testid="places-found">
                    <p className="text-xs font-medium text-muted-foreground">{t('world.bg.placesFound')}</p>
                    <div className="flex flex-wrap gap-2">{foundEntries.map(placeChip)}</div>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Button type="button" variant="outline" size="sm" className="max-md:h-10" disabled={finding} onClick={() => void handleFind()} data-testid="places-find">
                    {finding && <CircleNotch className="size-3.5 animate-spin" aria-hidden="true" />}
                    {finding ? t('world.bg.finding') : t('world.bg.find')}
                  </Button>
                  <span className="text-xs text-muted-foreground">{t('world.bg.findCost')}</span>
                </div>
                {findMsg && <p className="text-sm text-muted-foreground" role="status">{findMsg}</p>}
                <div className="flex flex-wrap gap-2">
                  {PLACE_CHIPS.map((chip) => {
                    const active = chipEntries.some((e) => e.value === chip.words);
                    return (
                      <Button
                        key={chip.id}
                        type="button"
                        role="checkbox"
                        aria-checked={active}
                        variant={active ? 'default' : 'outline'}
                        size="sm"
                        className="max-md:h-10"
                        onClick={() => toggleChip(chip.words)}
                      >
                        {active && <Check className="size-3.5" aria-hidden="true" />}
                        {t(`world.bg.place.${chip.id}` as MsgKey)}
                      </Button>
                    );
                  })}
                  {/* places typed in the field below: a chip each, ticked on add, untick to leave one out */}
                  {chipEntries.filter((e) => e.kind === 'custom').map(placeChip)}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    addCustom();
                  }}
                  className="flex flex-wrap gap-2"
                >
                  <Input
                    aria-label={t('world.bg.addPlace')}
                    placeholder={t('world.bg.placePh')}
                    value={customPlace}
                    onChange={(e) => setCustomPlace(e.target.value)}
                    className="h-10 md:h-9 flex-1 min-w-[8rem]"
                  />
                  <Button type="submit" variant="outline" className="max-md:h-10">
                    {t('world.bg.addPlaceGo')}
                  </Button>
                </form>
              </div>}

              <div className="space-y-2">
                <label className="text-sm font-medium">{t('world.bg.variants')}</label>
                <div role="radiogroup" aria-label={t('world.bg.variants')} className="flex flex-wrap gap-2">
                  {[1, 2, 3].map((v) => (
                    <Button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={variants === v}
                      variant={variants === v ? 'default' : 'outline'}
                      size="sm"
                      className="max-md:h-10"
                      onClick={() => setVariants(v as 1 | 2 | 3)}
                    >
                      {v}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm">
                  {model
                    ? t('world.bg.model', {
                        model: modelLabel || model,
                        from: t(
                          modelFrom === 'world' ? 'world.bg.modelWorld' : 'world.bg.modelApp',
                        ),
                      })
                    : t('world.bg.modelNone')}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="max-md:h-10 ml-2"
                    data-testid="bg-model-change"
                    onClick={() => setImgDialog(true)}
                  >
                    {t('world.bg.modelChange')}
                  </Button>
                </p>
                <p className="text-sm text-muted-foreground">
                  {t('world.bg.cost', { n: costN })}
                  {t('world.bg.costUnknown')} {t('world.bg.costPlan')}
                </p>
              </div>

              <Button
                data-testid="bg-plan"
                type="button"
                disabled={costN === 0 || planBusy || !model}
                onClick={handlePlan}
                className="max-md:h-10"
              >
                {planBusy ? t('world.bg.planning') : t('world.bg.plan')}
              </Button>

              {error && (
                <WorldErrorCard
                  error={error}
                  onRetry={handlePlan}
                  busy={planBusy}
                  again={false}
                />
              )}
            </div>
          )}

          {stage !== 'form' && (
            <div data-testid="bg-review" className="space-y-4">
              <h3 className="font-medium">{t('world.bg.review')}</h3>
              {!drawing && <p className="text-sm text-muted-foreground">{t('world.bg.reviewLead')}</p>}
              {drawing && progress && (
                <div
                  data-testid="bg-progress"
                  role="status"
                  className="space-y-2"
                >
                  <p className="text-sm">
                    {t('world.bg.drawing', { done: progress.done, total: progress.total })}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {review
                      .filter((i) => i.url)
                      .map((i) => (
                        <img
                          key={i.key}
                          src={i.url}
                          alt=""
                          className="w-14 aspect-video object-cover rounded border"
                        />
                      ))}
                  </div>
                </div>
              )}

              {drawing && (
                <Button
                  data-testid="bg-stop"
                  type="button"
                  variant="destructive"
                  onClick={handleStop}
                  className="max-md:h-10"
                >
                  {t('world.bg.stop')}
                </Button>
              )}

              <div className="space-y-3">
                {review.map((item) => (
                  <ReviewRow
                    key={item.key}
                    item={item}
                    takenNames={takenNames}
                    review={review}
                    setReview={setReview}
                    drawing={drawing}
                    warnedRef={warnedRef}
                    t={t}
                  />
                ))}
              </div>

              {!drawing && (
                <div className="flex flex-wrap gap-2">
                  {drawCount > 0 && stage !== 'finished' && (
                    <Button
                      data-testid="bg-draw"
                      type="button"
                      onClick={startDrawing}
                      className="max-md:h-10"
                    >
                      {t('world.bg.draw', { n: drawCount })}
                    </Button>
                  )}
                  {failedCount > 0 && (
                    <Button
                      data-testid="bg-retry"
                      type="button"
                      variant="outline"
                      onClick={handleRetry}
                      className="max-md:h-10"
                    >
                      {t('world.bg.retry', { n: failedCount })}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleReplan}
                    disabled={drawing}
                    className="max-md:h-10"
                  >
                    {t('world.bg.replan')}
                  </Button>
                </div>
              )}

              {stopped && (
                <p className="text-sm text-muted-foreground">
                  {t('world.bg.stopped', { n: doneCount })}
                </p>
              )}
            </div>
          )}
        </div>
      )}
      <ImageModelDialog open={imgDialog} onOpenChange={setImgDialog} chatId={"chatId" in wref ? wref.chatId : null} />
    </section>
  );
}

function ReviewRow({
  item,
  takenNames,
  review,
  setReview,
  drawing,
  warnedRef,
  t,
}: {
  item: ReviewItem;
  takenNames: string[];
  review: ReviewItem[];
  setReview: React.Dispatch<React.SetStateAction<ReviewItem[]>>;
  drawing: boolean;
  warnedRef: React.MutableRefObject<Set<string>>;
  t: ReturnType<typeof useT>;
}) {
  const [localFile, setLocalFile] = useState(item.file);
  const [localTags, setLocalTags] = useState(item.tagsText);
  const [promptOpen, setPromptOpen] = useState(false);

  useEffect(() => {
    setLocalFile(item.file);
  }, [item.file]);

  useEffect(() => {
    setLocalTags(item.tagsText);
  }, [item.tagsText]);

  const enforceName = () => {
    const snake = toSnake(localFile);
    const others = review.map((i) => (i.key === item.key ? '' : i.file)).filter(Boolean);
    const next = uniqueName(snake, [...takenNames, ...others]);
    if (next !== localFile && !warnedRef.current.has(item.key)) {
      toast.info(t('world.bg.nameBad'));
      warnedRef.current.add(item.key);
    }
    setLocalFile(next);
    setReview((prev) => prev.map((i) => (i.key === item.key ? { ...i, file: next } : i)));
  };

  return (
    <div
      className={`flex flex-col gap-2 rounded-md border p-3 ${
        item.removed ? 'opacity-50' : ''
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        {item.url && (
          <img
            src={item.url}
            alt=""
            className="w-14 aspect-video object-cover rounded border"
          />
        )}
        <span className="text-xs font-medium">{item.place}</span>
        {item.status === 'failed' && (
          <span className="text-xs text-destructive">{t('world.bg.failed')}</span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Input
          aria-label={t('world.bg.file')}
          value={localFile}
          onChange={(e) => setLocalFile(e.target.value)}
          onBlur={enforceName}
          disabled={drawing || item.status === 'done'}
          className="h-10 md:h-9 flex-1 min-w-[8rem]"
        />
        <Input
          aria-label={t('world.bg.tags')}
          placeholder={t('world.bg.tagsPh')}
          value={localTags}
          onChange={(e) => {
            setLocalTags(e.target.value);
            setReview((prev) =>
              prev.map((i) => (i.key === item.key ? { ...i, tagsText: e.target.value } : i)),
            );
          }}
          disabled={drawing || item.status === 'done'}
          className="h-10 md:h-9 flex-[2] min-w-[12rem]"
        />
      </div>

      <div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="max-md:h-10"
          aria-expanded={promptOpen}
          onClick={() => setPromptOpen((p) => !p)}
        >
          {t('world.bg.prompt')}
        </Button>
        {promptOpen && (
          <Textarea
            rows={4}
            value={item.prompt}
            onChange={(e) =>
              setReview((prev) =>
                prev.map((i) => (i.key === item.key ? { ...i, prompt: e.target.value } : i)),
              )
            }
            disabled={drawing}
            className="mt-2"
          />
        )}
      </div>

      {item.error && <p className="text-xs text-destructive">{item.error}</p>}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="max-md:h-10 self-start"
        disabled={drawing || item.status === 'done'}
        onClick={() =>
          setReview((prev) =>
            prev.map((i) => (i.key === item.key ? { ...i, removed: !i.removed } : i)),
          )
        }
      >
        {item.removed ? t('world.bg.putBack') : t('world.bg.remove')}
      </Button>
    </div>
  );
}
