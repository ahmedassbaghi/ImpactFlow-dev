"""
Módulo C — Segmentació de participants (K-Means).

Clusteritza els participants en baseline per identificar perfils diferenciats
sobre les 4 dimensions del IPI. Sense sklearn obligatori: implementació
pròpia de K-Means per a n < 200 participants.

Quan scipy/sklearn estiguin disponibles s'usen per al coeficient de Silhouette.
"""
from __future__ import annotations

import math
import random
from typing import Optional


# ---------------------------------------------------------------------------
# Perfils predefinits (etiquetes semàntiques per als 5 clusters)
# ---------------------------------------------------------------------------

CLUSTER_PROFILES = [
    {
        "label": "Aprenent Sòlid",
        "description": "Alt nivell acadèmic i bona autonomia cognitiva. Integració en procés.",
        "centroid_hint": {"academic": 70, "cognitive": 65, "social": 55, "integration": 50},
        "strategy": "Consolidar avenços acadèmics i ampliar competències socials.",
        "recommended_goal_dims": ["social", "integration"],
    },
    {
        "label": "Potencial Social",
        "description": "Excel·lent integració social i empatia. Àrea acadèmica necessita suport.",
        "centroid_hint": {"academic": 35, "cognitive": 45, "social": 75, "integration": 70},
        "strategy": "Aprofitar el vincle social per motivar l'aprenentatge acadèmic.",
        "recommended_goal_dims": ["academic", "cognitive"],
    },
    {
        "label": "Alta Energia",
        "description": "Capacitat cognitiva alta però regulació emocional per treballar.",
        "centroid_hint": {"academic": 55, "cognitive": 70, "social": 45, "integration": 50},
        "strategy": "Canalitzar energia en projectes estructurats. Micro-objectius curts.",
        "recommended_goal_dims": ["social", "cognitive"],
    },
    {
        "label": "En Construcció",
        "description": "Nivells baixos a totes les dimensions, però motivació observable.",
        "centroid_hint": {"academic": 25, "cognitive": 30, "social": 35, "integration": 30},
        "strategy": "Intervencions intensives i personalitzades. Objectius molt assolibles.",
        "recommended_goal_dims": ["academic", "cognitive", "social"],
    },
    {
        "label": "Avançat",
        "description": "Alt nivell a totes les dimensions. Referent positiu del grup.",
        "centroid_hint": {"academic": 80, "cognitive": 78, "social": 80, "integration": 75},
        "strategy": "Rol de mentor entre iguals. Objectius d'excel·lència i lideratge.",
        "recommended_goal_dims": ["integration"],
    },
]


# ---------------------------------------------------------------------------
# K-Means (implementació pròpia, sense sklearn)
# ---------------------------------------------------------------------------

def _distance(a: list[float], b: list[float]) -> float:
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))


def _centroid(points: list[list[float]]) -> list[float]:
    n = len(points)
    d = len(points[0])
    return [sum(p[i] for p in points) / n for i in range(d)]


def _kmeans(
    data: list[list[float]],
    k: int = 5,
    max_iter: int = 100,
    seed: int = 42,
) -> list[int]:
    """K-Means++ initialization + Lloyd iterations. Returns cluster assignments."""
    n = len(data)
    if n <= k:
        return list(range(n))

    rng = random.Random(seed)

    # K-Means++ init
    centroids: list[list[float]] = [rng.choice(data)]
    while len(centroids) < k:
        dists = [min(_distance(p, c) ** 2 for c in centroids) for p in data]
        total = sum(dists)
        if total == 0:
            centroids.append(rng.choice(data))
            continue
        probs = [d / total for d in dists]
        cumulative = 0.0
        r = rng.random()
        for i, p in enumerate(probs):
            cumulative += p
            if cumulative >= r:
                centroids.append(data[i])
                break
        else:
            centroids.append(data[-1])

    assignments = [0] * n
    for _ in range(max_iter):
        # Assign
        new_assignments = [
            min(range(k), key=lambda c: _distance(data[i], centroids[c]))
            for i in range(n)
        ]
        if new_assignments == assignments:
            break
        assignments = new_assignments
        # Update centroids
        for c in range(k):
            members = [data[i] for i in range(n) if assignments[i] == c]
            if members:
                centroids[c] = _centroid(members)

    return assignments


def _silhouette_score(data: list[list[float]], assignments: list[int]) -> float:
    """Approximate silhouette coefficient (O(n^2), fine for n < 300)."""
    try:
        import numpy as np
        from sklearn.metrics import silhouette_score as _sk_sil
        return float(_sk_sil(np.array(data), assignments))
    except ImportError:
        pass

    n = len(data)
    k = max(assignments) + 1
    if k < 2 or n < 4:
        return 0.0

    scores: list[float] = []
    for i in range(n):
        same = [data[j] for j in range(n) if assignments[j] == assignments[i] and j != i]
        if not same:
            scores.append(0.0)
            continue
        a = sum(_distance(data[i], p) for p in same) / len(same)

        other_means = []
        for c in range(k):
            if c == assignments[i]:
                continue
            others = [data[j] for j in range(n) if assignments[j] == c]
            if others:
                other_means.append(sum(_distance(data[i], p) for p in others) / len(others))

        if not other_means:
            scores.append(0.0)
            continue
        b = min(other_means)
        scores.append((b - a) / max(a, b) if max(a, b) > 0 else 0.0)

    return round(sum(scores) / len(scores), 3) if scores else 0.0


# ---------------------------------------------------------------------------
# Assign semantic profile labels based on centroid similarity
# ---------------------------------------------------------------------------

def _assign_profile(centroid: list[float]) -> dict:
    """Match a computed centroid to the nearest predefined profile."""
    dims = ["academic", "cognitive", "social", "integration"]
    best_dist = float("inf")
    best_profile = CLUSTER_PROFILES[0]

    for profile in CLUSTER_PROFILES:
        hint = [profile["centroid_hint"][d] for d in dims]
        dist = _distance(centroid, hint)
        if dist < best_dist:
            best_dist = dist
            best_profile = profile

    return best_profile


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def cluster_participants(
    participants_data: list[dict],
    n_clusters: int = 5,
) -> dict:
    """
    Clusteritza participants per les seves puntuacions de baseline.

    Input:
        participants_data: list of {
            participant_id: str,
            academic: float,    # 0-100
            cognitive: float,
            social: float,
            integration: float,
        }

    Output: {
        clusters: [...],
        participant_assignments: {participant_id: cluster_id},
        silhouette_score: float,
        n_clusters_effective: int,
    }
    """
    n = len(participants_data)
    if n == 0:
        return {"clusters": [], "participant_assignments": {}, "silhouette_score": None, "n_clusters_effective": 0}

    dims = ["academic", "cognitive", "social", "integration"]
    ids = [p["participant_id"] for p in participants_data]
    data = [[float(p.get(d) or 0) for d in dims] for p in participants_data]

    k = min(n_clusters, n)
    assignments = _kmeans(data, k=k)
    sil = _silhouette_score(data, assignments)

    # Build cluster summaries
    clusters = []
    for c in range(k):
        members_idx = [i for i, a in enumerate(assignments) if a == c]
        if not members_idx:
            continue
        member_ids = [ids[i] for i in members_idx]
        member_data = [data[i] for i in members_idx]
        centroid = _centroid(member_data)

        profile = _assign_profile(centroid)
        centroid_dict = {d: round(centroid[i], 1) for i, d in enumerate(dims)}

        clusters.append({
            "cluster_id": c,
            "label": profile["label"],
            "description": profile["description"],
            "strategy": profile["strategy"],
            "participants": member_ids,
            "n": len(member_ids),
            "centroid": centroid_dict,
            "recommended_goal_dimensions": profile["recommended_goal_dims"],
        })

    # Sort clusters by label for stable output
    clusters.sort(key=lambda c: c["label"])
    # Reassign cluster_id after sort
    id_map = {c["cluster_id"]: new_id for new_id, c in enumerate(clusters)}
    for c in clusters:
        old_id = c["cluster_id"]
        c["cluster_id"] = id_map[old_id]

    participant_assignments = {
        ids[i]: id_map[assignments[i]]
        for i in range(n)
        if assignments[i] in id_map
    }

    return {
        "clusters": clusters,
        "participant_assignments": participant_assignments,
        "silhouette_score": sil,
        "n_clusters_effective": len(clusters),
    }


def recommend_goals_for_cluster(cluster_label: str) -> list[dict]:
    """Micro-goals recomanats per un perfil de clúster."""
    templates: dict[str, list[dict]] = {
        "Aprenent Sòlid": [
            {"title": "Participar activament en una activitat de grup", "dimension": "social", "difficulty": 1},
            {"title": "Explicar un concepte après a un company", "dimension": "social", "difficulty": 2},
            {"title": "Completa un vocabulari de 10 paraules en català", "dimension": "integration", "difficulty": 1},
        ],
        "Potencial Social": [
            {"title": "Llegir 10 minuts seguits sense interrupcions", "dimension": "academic", "difficulty": 1},
            {"title": "Resoldre 5 problemes de càlcul sense ajuda", "dimension": "academic", "difficulty": 2},
            {"title": "Completar una tasca cognitiva de 15 min", "dimension": "cognitive", "difficulty": 1},
        ],
        "Alta Energia": [
            {"title": "Completar una tasca de 20 min sense interrupcions", "dimension": "cognitive", "difficulty": 2},
            {"title": "Esperar el torn en una activitat grupal sense intervenir", "dimension": "social", "difficulty": 1},
            {"title": "Autoavaluar-se al final de la sessió", "dimension": "cognitive", "difficulty": 1},
        ],
        "En Construcció": [
            {"title": "Identificar la lletra inicial d'un mot", "dimension": "academic", "difficulty": 1},
            {"title": "Saludar en català al profesional", "dimension": "integration", "difficulty": 1},
            {"title": "Participar 1 cop en l'activitat de grup", "dimension": "social", "difficulty": 1},
        ],
        "Avançat": [
            {"title": "Ajudar un company a comprendre un exercici", "dimension": "social", "difficulty": 3},
            {"title": "Presentar un treball creatiu al grup", "dimension": "integration", "difficulty": 3},
            {"title": "Crear un mini-projecte autònom en 2 setmanes", "dimension": "cognitive", "difficulty": 3},
        ],
    }
    return templates.get(cluster_label, [])
