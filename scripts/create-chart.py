from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
APP=Path(__file__).resolve().parents[1]
points=[58,59,61,63,62]
fig,ax=plt.subplots(figsize=(10,6),dpi=100)
fig.patch.set_facecolor("#f4f9ff");ax.set_facecolor("#f4f9ff")
ax.plot(range(1,6),points,color="#087fff",linewidth=4,marker="o",markersize=11)
for x,y in enumerate(points,1):ax.annotate(str(y),(x,y),xytext=(0,13),textcoords="offset points",ha="center",fontsize=18)
ax.set_title("Classroom sample · not live weather",fontsize=23,pad=25,color="#102544")
ax.set_xlabel("Sample point",fontsize=18);ax.set_ylabel("Temperature (°F)",fontsize=18);ax.set_xticks(range(1,6));ax.set_ylim(55,67);ax.tick_params(labelsize=16);ax.grid(alpha=.2)
fig.tight_layout();fig.savefig(APP/"public/demo-chart.png");plt.close(fig)
print("Created labelled classroom sample chart.")
