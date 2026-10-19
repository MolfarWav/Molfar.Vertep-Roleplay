import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '@/hooks/use-t';
import { useApp } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Check, CaretDown } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { fetchVisionModel } from '@/lib/engine';
import { backgroundBlob } from '@/lib/webp';
import {
  downscaleForVision,
  looksUnnamed,
  parseTags,
  toSnake,
  uniqueName,
} from '@/lib/world-backgrounds';
import { nameBackgroundImage, type WorldErrorCode } from '@/lib/world';
import { WorldErrorCard } from './world-controls';

type ReviewItem = {
  id: string;
  oldName: string;
  url: string;
  ok: boolean;
  file?: string;
  newName: string;
  tagsText: string;
  checked: boolean;
  message?: string;
  code?: string;
};

export function NameWithVision({ folderId }: { folderId: string }) {
  const t = useT();
  const allBackgrounds = useApp((s) => s.backgrounds);
  const updateBackground = useApp((s) => s.updateBackground);
  const images = useMemo(
    () => allBackgrounds.filter((b) => b.folderId === folderId && b.type === 'image'),
    [allBackgrounds, folderId]
  );

  const [open, setOpen] = useState(false);
  const [visionModel, setVisionModel] = useState<string | null>(null);
  const [modelLoading, setModelLoading] = useState(false);
  // until the player ticks something, the unnamed-looking images are the selection (it follows the library)
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const selectedIds = useMemo(
    () => picked ?? new Set(images.filter((b) => looksUnnamed(b.name)).map((b) => b.id)),
    [picked, images]
  );
  const setSelectedIds = (next: Set<string> | ((prev: Set<string>) => Set<string>)) =>
    setPicked(typeof next === 'function' ? next(selectedIds) : next);
  const [running, setRunning] = useState(false);
  const stopRef = useRef(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [topError, setTopError] = useState<{ code: string; message: string } | null>(null);
  const [review, setReview] = useState<ReviewItem[]>([]);

  // the engine's Vision model, read each time the fold opens
  useEffect(() => {
    if (!open) return;
    let active = true;
    setModelLoading(true);
    fetchVisionModel()
      .then((m) => { if (active) setVisionModel(m); })
      .catch(() => { if (active) setVisionModel(null); })
      .finally(() => { if (active) setModelLoading(false); });
    return () => {
      active = false;
    };
  }, [open]);

  const unnamedCount = images.filter((b) => looksUnnamed(b.name)).length;

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectUnnamed = () => {
    setSelectedIds(
      new Set(images.filter((b) => looksUnnamed(b.name)).map((b) => b.id))
    );
  };

  const handleStop = () => {
    stopRef.current = true;
  };

  const handleRun = async () => {
    const selectedImages = images.filter((b) => selectedIds.has(b.id));
    if (!selectedImages.length || !visionModel) return;

    setRunning(true);
    stopRef.current = false;
    setProgress({ done: 0, total: selectedImages.length });
    setReview([]);
    setTopError(null);

    const nextReview: ReviewItem[] = [];
    let firstCode: string | null = null;

    for (let i = 0; i < selectedImages.length; i++) {
      if (stopRef.current) break;

      const b = selectedImages[i];
      setProgress({ done: i, total: selectedImages.length });

      try {
        const blob = await backgroundBlob(b.url);
        const small = await downscaleForVision(blob, 768);
        const hint = images
          .filter((x) => x.id !== b.id)
          .map((x) => x.name)
          .slice(0, 12)
          .join(', ');

        const r = await nameBackgroundImage(small, { hint });

        if (r.ok && r.file) {
          nextReview.push({
            id: b.id,
            oldName: b.name,
            url: b.url,
            ok: true,
            file: r.file,
            newName: toSnake(r.file),
            tagsText: (r.tags ?? []).join(', '),
            checked: true,
          });
        } else {
          const code = r.code;
          const message = r.error ?? r.message ?? t('world.bg.nameSkip');
          nextReview.push({
            id: b.id,
            oldName: b.name,
            url: b.url,
            ok: false,
            message,
            code,
            newName: '',
            tagsText: '',
            checked: false,
          });
          if (code && !firstCode) {
            firstCode = code;
            setTopError({ code, message });
            if (['auth', 'model', 'rate'].includes(code)) {
              stopRef.current = true;
            }
          }
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        nextReview.push({
          id: b.id,
          oldName: b.name,
          url: b.url,
          ok: false,
          message,
          newName: '',
          tagsText: '',
          checked: false,
        });
      }

      setProgress({ done: i + 1, total: selectedImages.length });
      setReview([...nextReview]);
    }

    setRunning(false);
    stopRef.current = false;
  };

  const updateReviewField = <K extends keyof ReviewItem>(
    index: number,
    field: K,
    value: ReviewItem[K]
  ) => {
    setReview((prev) =>
      prev.map((r, i) => (i === index ? { ...r, [field]: value } : r))
    );
  };

  const handleApply = () => {
    const ticked = review.filter((r) => r.checked && r.ok);
    if (!ticked.length) return;

    const folderBackgrounds = allBackgrounds.filter(
      (b) => b.folderId === folderId
    );
    const assigned = new Set<string>();
    let count = 0;

    for (const r of ticked) {
      const b = folderBackgrounds.find((x) => x.id === r.id);
      if (!b) continue;

      const taken = new Set(
        folderBackgrounds.filter((x) => x.id !== b.id).map((x) => x.name)
      );
      for (const n of assigned) taken.add(n);

      const name = uniqueName(toSnake(r.newName) || b.name, taken);
      updateBackground(b.id, { name, tags: parseTags(r.tagsText) });
      assigned.add(name);
      count++;
    }

    toast.success(t('world.bg.nameDone', { n: count }));
    setReview([]);
    setPicked(null);
  };

  const tickedCount = review.filter((r) => r.checked && r.ok).length;

  return (
    <div className="space-y-3">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 max-md:min-h-12"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        data-testid="bg-name-toggle"
      >
        <span className="flex min-w-0 flex-col">
          <span className="font-medium">{t('world.bg.name')}</span>
          <span className="text-sm text-muted-foreground">{t('world.bg.nameHint')}</span>
        </span>
        <CaretDown
          className={`size-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="space-y-3 pl-1">
          {!visionModel && !modelLoading && (
            <p className="text-sm text-muted-foreground">
              {t('world.bg.nameNoModel')}
            </p>
          )}

          {images.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t('world.bg.imagesEmpty')}
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="max-md:h-10"
                  onClick={selectUnnamed}
                >
                  {t('world.bg.namePick', { n: unnamedCount })}
                </Button>
                <span className="text-sm text-muted-foreground">
                  {t('world.bg.nameSel', { n: selectedIds.size })}
                </span>
              </div>

              <div className="space-y-1">
                {images.map((b) => (
                  <button
                    type="button"
                    key={b.id}
                    role="checkbox"
                    aria-checked={selectedIds.has(b.id)}
                    onClick={() => toggleSelected(b.id)}
                    className="flex min-h-10 w-full cursor-pointer items-center gap-3 rounded-md p-2 text-left hover:bg-muted"
                  >
                    <span className={`flex size-5 shrink-0 items-center justify-center rounded border ${selectedIds.has(b.id) ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground'}`}>
                      {selectedIds.has(b.id) && <Check className="size-3.5" aria-hidden="true" />}
                    </span>
                    <img
                      src={b.url}
                      alt=""
                      className="aspect-video w-12 shrink-0 rounded object-cover"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {b.name}
                    </span>
                  </button>
                ))}
              </div>

              {visionModel ? (
                <p className="text-sm text-muted-foreground">
                  {t('world.bg.nameCost', {
                    n: selectedIds.size,
                    model: visionModel,
                  })}
                </p>
              ) : null}

              <Button
                className="max-md:h-10"
                disabled={!visionModel || selectedIds.size === 0 || running}
                onClick={handleRun}
                data-testid="bg-name-run"
              >
                {t('world.bg.nameRun', { n: selectedIds.size })}
              </Button>

              {running && (
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className="text-sm"
                    data-testid="bg-name-progress"
                    role="status"
                  >
                    {t('world.bg.nameProgress', {
                      done: progress.done,
                      total: progress.total,
                    })}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="max-md:h-10"
                    onClick={handleStop}
                    disabled={!running}
                  >
                    {t('world.bg.stop')}
                  </Button>
                </div>
              )}
            </>
          )}

          {topError && <WorldErrorCard error={{ code: topError.code as WorldErrorCode, message: topError.message }} again={false} />}

          {review.length > 0 && (
            <div className="space-y-2">
              <h4
                className="font-medium"
                data-testid="bg-name-review"
              >
                {t('world.bg.nameReview')}
              </h4>

              <div className="space-y-2">
                {review.map((r, i) => (
                  <div
                    key={r.id}
                    className="flex flex-wrap items-start gap-3 rounded-md border p-2"
                  >
                    <img
                      src={r.url}
                      alt=""
                      className="aspect-video w-16 shrink-0 rounded object-cover"
                    />
                    <div className="min-w-[200px] flex-1 space-y-2">
                      {r.ok ? (
                        <>
                          <div>
                            <div className="text-xs text-muted-foreground">
                              {t('world.bg.nameOld')}
                            </div>
                            <div className="text-sm">{r.oldName}</div>
                          </div>
                          <div>
                            <label
                              htmlFor={`bg-name-new-${r.id}`}
                              className="text-xs text-muted-foreground"
                            >
                              {t('world.bg.nameNew')}
                            </label>
                            <Input
                              id={`bg-name-new-${r.id}`}
                              className="h-10 md:h-9"
                              value={r.newName}
                              onChange={(e) =>
                                updateReviewField(i, 'newName', e.target.value)
                              }
                              aria-label={t('world.bg.nameNew')}
                            />
                          </div>
                          <div>
                            <label
                              htmlFor={`bg-name-tags-${r.id}`}
                              className="text-xs text-muted-foreground"
                            >
                              {t('world.bg.tags')}
                            </label>
                            <Input
                              id={`bg-name-tags-${r.id}`}
                              className="h-10 md:h-9"
                              placeholder={t('world.bg.tagsPh')}
                              value={r.tagsText}
                              onChange={(e) =>
                                updateReviewField(i, 'tagsText', e.target.value)
                              }
                              aria-label={t('world.bg.tags')}
                            />
                          </div>
                        </>
                      ) : (
                        <div className="text-sm text-destructive">
                          {r.oldName} — {t('world.bg.nameSkip')}
                          {r.message ? `: ${r.message}` : ''}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={r.checked}
                      aria-label={r.oldName}
                      onClick={() =>
                        updateReviewField(i, 'checked', !r.checked)
                      }
                      className="flex size-8 shrink-0 cursor-pointer items-center justify-center"
                    >
                      <span className={`flex size-5 items-center justify-center rounded border ${r.checked ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground'}`}>
                        {r.checked && <Check className="size-3.5" aria-hidden="true" />}
                      </span>
                    </button>
                  </div>
                ))}
              </div>

              <Button
                className="max-md:h-10"
                disabled={tickedCount === 0}
                onClick={handleApply}
                data-testid="bg-name-apply"
              >
                {t('world.bg.nameApply', { n: tickedCount })}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
