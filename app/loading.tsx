import { Skeleton, SkeletonText } from "@/components/base/skeleton/skeleton";

/* Le chargement d'une page du site, dans la forme de la page elle-même :
   la barre du héros, son grand titre, la rangée de six mesures, puis la
   première rangée de cartes. Les blocs sont teintés depuis l'encre à 8 %
   et portent le balayage de lumière de BoardUI — ils se fondent dans le
   thème sombre au lieu d'être un gris fixé qui disparaît sur une carte
   sombre (c'est exactement pour ça qu'ils ne prennent pas un hex). */
export default function Loading() {
  return (
    <div className="space-y-5" aria-busy>
      {/* la tête de page : titre + phrase */}
      <div className="flex flex-col gap-2">
        <Skeleton shape="text" className="h-6 w-44" />
        <Skeleton shape="text" className="h-3.5 w-full max-w-2xl" />
      </div>

      {/* le héros */}
      <div className="rounded-2xl border border-line bg-panel/60 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-2.5">
            <Skeleton shape="text" className="h-3 w-40" />
            <Skeleton shape="text" className="h-7 w-64" />
            <Skeleton shape="text" className="h-3 w-80 max-w-full" />
          </div>
          <div className="flex flex-col items-end gap-2">
            <Skeleton shape="text" className="h-5 w-32" />
            <Skeleton shape="text" className="h-5 w-24" />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2.5 md:grid-cols-4 xl:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="rounded-xl border border-white/[0.055] bg-white/[0.022] px-3 py-2.5">
              <Skeleton shape="text" className="h-2.5 w-20" />
              <Skeleton shape="text" className="mt-1.5 h-4 w-14" />
              <Skeleton shape="text" className="mt-1.5 h-2.5 w-16" />
            </div>
          ))}
        </div>
      </div>

      {/* la première rangée de cartes */}
      <div className="grid gap-4 xl:grid-cols-[1.15fr_1fr]">
        <div className="rounded-2xl border border-line bg-panel/60 p-4">
          <Skeleton shape="text" className="h-3.5 w-48" />
          <SkeletonText lines={5} className="mt-4" />
        </div>
        <div className="rounded-2xl border border-line bg-panel/60 p-4">
          <Skeleton shape="text" className="h-3.5 w-40" />
          <Skeleton className="mt-4 h-48 w-full" />
        </div>
      </div>
    </div>
  );
}
