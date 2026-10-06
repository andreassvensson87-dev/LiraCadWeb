using ACadSharp.IO.Templates;
using ACadSharp.Objects;
using System;

namespace ACadSharp.IO.DWG;
internal partial class DwgObjectReader
{
    private CadTemplate readLiraTextContext()
    {
        var context = new LiraTextObjectContextData();
        var template = new CadAnnotScaleObjectContextDataTemplate(context);
        readAnnotScaleObjectContextData(template);
        context.HorizontalMode = _mergedReaders.ReadBitShort();
        context.Rotation = _mergedReaders.ReadBitDouble();
        context.Insertion = _mergedReaders.Read2RawDouble();
        context.Alignment = _mergedReaders.Read2RawDouble();
        return template;
    }

    private CadTemplate readLiraMTextContext()
    {
        var context = new LiraMTextObjectContextData();
        var template = new CadAnnotScaleObjectContextDataTemplate(context);
        readAnnotScaleObjectContextData(template);
        context.Attachment = _mergedReaders.ReadBitLong();
        // DWG stores direction before insertion (DXF lists insertion first).
        context.Direction = _mergedReaders.Read3BitDouble();
        context.Insertion = _mergedReaders.Read3BitDouble();
        context.Width = _mergedReaders.ReadBitDouble();
        context.Height = _mergedReaders.ReadBitDouble();
        context.ExtentsWidth = _mergedReaders.ReadBitDouble();
        context.ExtentsHeight = _mergedReaders.ReadBitDouble();
        context.ColumnType = _mergedReaders.ReadBitLong();
        if (context.ColumnType != 0)
        {
            context.ColumnCount = _mergedReaders.ReadBitLong();
            if (context.ColumnCount < 0 || context.ColumnCount > 10000)
                throw new FormatException("Invalid MTEXT annotation column count.");
            context.ColumnWidth = _mergedReaders.ReadBitDouble();
            context.Gutter = _mergedReaders.ReadBitDouble();
            context.AutoHeight = _mergedReaders.ReadBit();
            context.Reversed = _mergedReaders.ReadBit();
            if (!context.AutoHeight && context.ColumnType == 2)
            {
                context.ColumnHeights = new double[context.ColumnCount];
                for (int i = 0; i < context.ColumnCount; i++)
                    context.ColumnHeights[i] = _mergedReaders.ReadBitDouble();
            }
        }
        return template;
    }
    private CadTemplate readLiraDimensionContext(string kind)
    {
        var context = new LiraDimensionObjectContextData(kind);
        var template = new LiraDimensionContextTemplate(context);
        readAnnotScaleObjectContextData(template);
        context.TextPoint = _mergedReaders.Read2RawDouble();
        context.UserTextLocation = _mergedReaders.ReadBit();
        context.TextRotation = _mergedReaders.ReadBitDouble();
        template.BlockHandle = handleReference();
        context.Reserved = _mergedReaders.ReadBit();
        context.DimTofl = _mergedReaders.ReadBit();
        context.DimOsxd = _mergedReaders.ReadBit();
        context.DimAtfit = _mergedReaders.ReadBit();
        context.DimTix = _mergedReaders.ReadBit();
        context.DimTmove = _mergedReaders.ReadBit();
        context.OverrideCode = _mergedReaders.ReadByte();
        context.HasArrow2 = _mergedReaders.ReadBit();
        context.FlipArrow2 = _mergedReaders.ReadBit();
        context.FlipArrow1 = _mergedReaders.ReadBit();
        context.FirstPoint = _mergedReaders.Read3BitDouble();
        if (kind is "DMDIM" or "RADIMLG" or "ORDDIM")
            context.SecondPoint = _mergedReaders.Read3BitDouble();
        return template;
    }

}
